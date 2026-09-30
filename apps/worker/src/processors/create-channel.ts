import { prisma } from "@channelbase/database";
import {
  BrandEngine,
  CharacterEngine,
  ChannelBrain,
  ContentPlanEngine,
  StoryBibleEngine,
  WorldEngine,
} from "@channelbase/channel-brain";
import { CHANNEL_BUILD_STAGE_LABELS, CHANNEL_BUILD_STAGE_PROGRESS, type ChannelBuildStage } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { providerRouter } from "../lib/provider-router.js";
import { RouterBackedLLMProvider } from "../lib/llm-adapter.js";
import { publishBuildProgress } from "../lib/pubsub.js";
import { markCompleted, markFailedOrRetry, markProgress, markRunning } from "../lib/job-run.js";
import { generateBrandAsset, generateCharacterReferenceAssets } from "../services/asset-generation.js";

const log = createLogger("worker:create-channel");
const llm = new RouterBackedLLMProvider(providerRouter);

const channelBrain = new ChannelBrain(llm);
const brandEngine = new BrandEngine(llm);
const characterEngine = new CharacterEngine(llm);
const worldEngine = new WorldEngine(llm);
const storyBibleEngine = new StoryBibleEngine(llm);
const contentPlanEngine = new ContentPlanEngine(llm);

const FIRST_EPISODE_BATCH_DAYS = 7;

export interface CreateChannelPayload {
  jobRunId: string;
  channelId: string;
  prompt: string;
}

async function announce(channelId: string, stage: ChannelBuildStage, status: "IN_PROGRESS" | "COMPLETED" | "FAILED", message?: string, error?: string) {
  await publishBuildProgress({
    channelId,
    stage,
    label: CHANNEL_BUILD_STAGE_LABELS[stage],
    progress: CHANNEL_BUILD_STAGE_PROGRESS[stage],
    status,
    message,
    error,
    timestamp: new Date().toISOString(),
  });
}

export async function processCreateChannel(payload: CreateChannelPayload): Promise<void> {
  const { jobRunId, channelId, prompt } = payload;
  await markRunning(jobRunId, "UNDERSTANDING_CONCEPT");

  try {
    await announce(channelId, "UNDERSTANDING_CONCEPT", "IN_PROGRESS");
    const spec = await channelBrain.generateChannelSpec(prompt);
    await prisma.channelSpecVersion.create({ data: { channelId, version: 1, sourcePrompt: prompt, spec: spec as never, isBaseline: true } });
    await prisma.channel.update({ where: { id: channelId }, data: { name: spec.identity.channelName, tagline: spec.identity.tagline, language: spec.identity.language, countryTarget: spec.identity.countryTarget } });
    await announce(channelId, "UNDERSTANDING_CONCEPT", "COMPLETED");
    await markProgress(jobRunId, CHANNEL_BUILD_STAGE_PROGRESS.UNDERSTANDING_CONCEPT, "UNDERSTANDING_CONCEPT");

    await announce(channelId, "BUILDING_AUDIENCE", "IN_PROGRESS");
    // Audience is already part of ChannelSpec — this stage exists as a distinct, named
    // moment in the UI progress narrative even though no additional generation is needed.
    await announce(channelId, "BUILDING_AUDIENCE", "COMPLETED");
    await markProgress(jobRunId, CHANNEL_BUILD_STAGE_PROGRESS.BUILDING_AUDIENCE, "BUILDING_AUDIENCE");

    await announce(channelId, "CREATING_BRAND", "IN_PROGRESS");
    const brand = await brandEngine.generate(spec);
    await prisma.brandBible.create({ data: { channelId, version: 1, data: brand as never } });
    await Promise.all((["LOGO", "AVATAR", "BANNER"] as const).map((kind) => generateBrandAsset({ channelId, kind, brand })));
    const avatarAsset = await prisma.asset.findFirst({ where: { channelId, type: "AVATAR" } });
    if (avatarAsset) await prisma.channel.update({ where: { id: channelId }, data: { avatarAssetId: avatarAsset.id } });
    await announce(channelId, "CREATING_BRAND", "COMPLETED");
    await markProgress(jobRunId, CHANNEL_BUILD_STAGE_PROGRESS.CREATING_BRAND, "CREATING_BRAND");

    await announce(channelId, "CREATING_CHARACTERS", "IN_PROGRESS");
    const characterDrafts = await characterEngine.generate(spec, brand);
    const characters = await Promise.all(
      characterDrafts.map((c) =>
        prisma.character.create({
          data: {
            channelId,
            name: c.name,
            role: c.role,
            species: c.species,
            genderPresentation: c.genderPresentation,
            ageDescription: c.appearance.ageDescription,
            heightDescription: c.appearance.heightDescription,
            bodyDescription: c.appearance.bodyDescription,
            faceDescription: c.appearance.faceDescription,
            hairDescription: c.appearance.hairDescription,
            eyeDescription: c.appearance.eyeDescription,
            clothingDescription: c.appearance.clothingDescription,
            accessories: c.appearance.accessories,
            personality: c.personality.personality,
            strengths: c.personality.strengths,
            weaknesses: c.personality.weaknesses,
            catchphrases: c.personality.catchphrases,
            speechStyle: c.personality.speechStyle,
            visualPrompt: c.visualPrompt,
            negativePrompt: c.negativePrompt,
            consistencyRules: c.consistencyRules,
            doNotChangeRules: c.doNotChangeRules,
          },
        }),
      ),
    );
    await Promise.all(characters.map((c) => generateCharacterReferenceAssets({ channelId, characterId: c.id, visualPrompt: c.visualPrompt, negativePrompt: c.negativePrompt })));

    const worldDrafts = await worldEngine.generate(spec, brand);
    for (const w of worldDrafts) {
      await prisma.world.create({
        data: {
          channelId,
          name: w.name,
          description: w.description,
          rules: w.rules,
          locations: {
            create: w.locations.map((l) => ({
              name: l.name,
              environmentDescription: l.environmentDescription,
              architecture: l.architecture,
              lighting: l.lighting,
              colorPalette: l.colorPalette,
              weather: l.weather,
              timeOfDayRules: l.timeOfDayRules,
              importantObjects: l.importantObjects,
              visualPrompt: l.visualPrompt,
              negativePrompt: l.negativePrompt,
            })),
          },
        },
      });
    }

    const storyBible = await storyBibleEngine.generate(spec, characterDrafts, worldDrafts);
    await prisma.storyBible.create({ data: { channelId, version: 1, data: storyBible as never } });

    await announce(channelId, "CREATING_CHARACTERS", "COMPLETED");
    await markProgress(jobRunId, CHANNEL_BUILD_STAGE_PROGRESS.CREATING_CHARACTERS, "CREATING_CHARACTERS");

    await announce(channelId, "PLANNING_CONTENT", "IN_PROGRESS");
    const periodStart = new Date();
    const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    const contentPlanDraft = await contentPlanEngine.generate(spec, periodStart, periodEnd);
    const contentPlan = await prisma.contentPlan.create({
      data: {
        channelId,
        periodStart,
        periodEnd,
        items: {
          create: contentPlanDraft.items.map((item) => ({
            titleIdea: item.titleIdea,
            concept: item.concept,
            contentPillar: item.contentPillar,
            series: item.series,
            format: item.format,
            targetDurationSeconds: item.targetDurationSeconds,
            hook: item.hook,
            educationalGoal: item.educationalGoal,
            emotionalGoal: item.emotionalGoal,
            targetPublishDate: new Date(item.targetPublishDate),
            priority: item.priority,
          })),
        },
      },
      include: { items: true },
    });
    await announce(channelId, "PLANNING_CONTENT", "COMPLETED");
    await markProgress(jobRunId, CHANNEL_BUILD_STAGE_PROGRESS.PLANNING_CONTENT, "PLANNING_CONTENT");

    await announce(channelId, "PREPARING_FIRST_EPISODES", "IN_PROGRESS");
    const firstBatchCutoff = new Date(periodStart.getTime() + FIRST_EPISODE_BATCH_DAYS * 24 * 60 * 60 * 1000);
    const firstBatch = contentPlan.items.filter((item) => item.targetPublishDate <= firstBatchCutoff);
    for (const item of firstBatch) {
      await prisma.episode.create({
        data: {
          channelId,
          contentPlanItemId: item.id,
          title: item.titleIdea,
          format: item.format,
          targetDurationSeconds: item.targetDurationSeconds,
          targetPublishDate: item.targetPublishDate,
          hook: item.hook,
          summary: item.concept,
          status: "IDEA",
        },
      });
    }
    await announce(channelId, "PREPARING_FIRST_EPISODES", "COMPLETED");
    await markProgress(jobRunId, CHANNEL_BUILD_STAGE_PROGRESS.PREPARING_FIRST_EPISODES, "PREPARING_FIRST_EPISODES");

    await prisma.channel.update({ where: { id: channelId }, data: { status: "ACTIVE" } });
    await announce(channelId, "CHANNEL_READY", "COMPLETED");
    await markCompleted(jobRunId, { channelId });
    log.info({ channelId }, "channel build completed");
  } catch (err) {
    log.error({ err, channelId }, "channel build failed");
    await prisma.channel.update({ where: { id: channelId }, data: { status: "DRAFT" } }).catch(() => undefined);
    await announce(channelId, "UNDERSTANDING_CONCEPT", "FAILED", undefined, err instanceof Error ? err.message : String(err));
    await markFailedOrRetry(jobRunId, "CREATE_CHANNEL", payload as unknown as Record<string, unknown>, err);
  }
}
