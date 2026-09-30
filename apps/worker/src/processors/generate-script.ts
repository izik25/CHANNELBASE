import { prisma } from "@channelbase/database";
import { ScriptEngine } from "@channelbase/channel-brain";
import type { BrandBible, ChannelSpec, CharacterDraft, StoryBible, WorldDraft } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { providerRouter } from "../lib/provider-router.js";
import { RouterBackedLLMProvider } from "../lib/llm-adapter.js";
import { markCompleted, markFailedOrRetry, markRunning, enqueueNext } from "../lib/job-run.js";
import { publishEpisodeProgress } from "../lib/pubsub.js";

const log = createLogger("worker:generate-script");
const scriptEngine = new ScriptEngine(new RouterBackedLLMProvider(providerRouter));

export interface GenerateScriptPayload {
  jobRunId: string;
  episodeId: string;
}

export async function processGenerateScript(payload: GenerateScriptPayload): Promise<void> {
  const { jobRunId, episodeId } = payload;
  await markRunning(jobRunId, "SCRIPTING");

  try {
    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId }, include: { channel: true } });
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "SCRIPTING" } });
    await publishEpisodeProgress({ episodeId, status: "SCRIPTING", progress: 5, timestamp: new Date().toISOString() });

    const [specVersion, brandRow, storyBibleRow, characterRows, worldRows] = await Promise.all([
      prisma.channelSpecVersion.findFirst({ where: { channelId: episode.channelId }, orderBy: { version: "desc" } }),
      prisma.brandBible.findFirst({ where: { channelId: episode.channelId }, orderBy: { version: "desc" } }),
      prisma.storyBible.findFirst({ where: { channelId: episode.channelId }, orderBy: { version: "desc" } }),
      prisma.character.findMany({ where: { channelId: episode.channelId, deletedAt: null } }),
      prisma.world.findMany({ where: { channelId: episode.channelId }, include: { locations: true } }),
    ]);

    if (!specVersion || !brandRow || !storyBibleRow) {
      throw new Error("Channel is missing its ChannelSpec/Brand/StoryBible — cannot generate a script yet.");
    }

    const spec = specVersion.spec as unknown as ChannelSpec;
    const brand = brandRow.data as unknown as BrandBible;
    const storyBible = storyBibleRow.data as unknown as StoryBible;
    const characters: CharacterDraft[] = characterRows.map((c) => ({
      name: c.name,
      role: c.role,
      species: c.species,
      genderPresentation: c.genderPresentation ?? undefined,
      appearance: {
        ageDescription: c.ageDescription ?? "",
        heightDescription: c.heightDescription ?? undefined,
        bodyDescription: c.bodyDescription ?? "",
        faceDescription: c.faceDescription ?? "",
        hairDescription: c.hairDescription ?? undefined,
        eyeDescription: c.eyeDescription ?? undefined,
        clothingDescription: c.clothingDescription ?? "",
        accessories: (c.accessories as string[]) ?? [],
      },
      personality: {
        personality: (c.personality as string[]) ?? [],
        strengths: (c.strengths as string[]) ?? [],
        weaknesses: (c.weaknesses as string[]) ?? [],
        catchphrases: (c.catchphrases as string[]) ?? [],
        speechStyle: c.speechStyle ?? "",
      },
      visualPrompt: c.visualPrompt,
      negativePrompt: c.negativePrompt,
      consistencyRules: (c.consistencyRules as string[]) ?? [],
      doNotChangeRules: (c.doNotChangeRules as string[]) ?? [],
    }));
    const worlds: WorldDraft[] = worldRows.map((w) => ({
      name: w.name,
      description: w.description,
      rules: (w.rules as string[]) ?? [],
      locations: w.locations.map((l) => ({
        name: l.name,
        environmentDescription: l.environmentDescription,
        architecture: l.architecture ?? undefined,
        lighting: l.lighting,
        colorPalette: (l.colorPalette as string[]) ?? [],
        weather: l.weather ?? undefined,
        timeOfDayRules: l.timeOfDayRules ?? undefined,
        importantObjects: (l.importantObjects as string[]) ?? [],
        visualPrompt: l.visualPrompt,
        negativePrompt: l.negativePrompt,
      })),
    }));

    const script = await scriptEngine.generateScript({
      spec,
      brand,
      storyBible,
      characters,
      worlds,
      contentPlanItem: {
        titleIdea: episode.title,
        concept: episode.summary ?? episode.title,
        hook: episode.hook ?? "",
        targetDurationSeconds: episode.targetDurationSeconds,
        format: episode.format,
      },
    });

    await prisma.episode.update({
      where: { id: episodeId },
      data: { script: script as never, hook: script.hook, summary: script.summary, status: "SCRIPT_REVIEW" },
    });
    await publishEpisodeProgress({ episodeId, status: "SCRIPT_REVIEW", progress: 12, timestamp: new Date().toISOString() });

    await markCompleted(jobRunId, { scenes: script.scenes.length });
    await enqueueNext("BREAKDOWN_EPISODE", { episodeId, channelId: episode.channelId });
  } catch (err) {
    log.error({ err, episodeId }, "script generation failed");
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "FAILED", lastError: err instanceof Error ? err.message : String(err) } }).catch(() => undefined);
    await publishEpisodeProgress({ episodeId, status: "FAILED", progress: 0, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
    await markFailedOrRetry(jobRunId, "GENERATE_SCRIPT", payload as unknown as Record<string, unknown>, err);
  }
}
