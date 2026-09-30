import { prisma } from "@channelbase/database";
import { DirectorEngine } from "@channelbase/channel-brain";
import type { BrandBible, EpisodeScript } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { markCompleted, markFailedOrRetry, markRunning, enqueueNext } from "../lib/job-run.js";
import { publishEpisodeProgress } from "../lib/pubsub.js";

const log = createLogger("worker:breakdown-episode");
const directorEngine = new DirectorEngine();

export interface BreakdownEpisodePayload {
  jobRunId: string;
  episodeId: string;
}

export async function processBreakdownEpisode(payload: BreakdownEpisodePayload): Promise<void> {
  const { jobRunId, episodeId } = payload;
  await markRunning(jobRunId, "SCENE_BREAKDOWN");

  try {
    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "SCENE_BREAKDOWN" } });
    await publishEpisodeProgress({ episodeId, status: "SCENE_BREAKDOWN", progress: 18, timestamp: new Date().toISOString() });

    const script = episode.script as unknown as EpisodeScript;
    if (!script) throw new Error("Episode has no script to break down.");

    // Makes this stage safely retryable: a prior attempt may have partially broken the
    // episode down before failing. Deleting existing scenes cascades to their Shot,
    // SceneCharacter, and scene-linked Asset rows (see schema.prisma onDelete: Cascade),
    // so retrying always starts this stage from a clean slate instead of colliding on
    // the (episodeId, sceneNumber) unique constraint.
    await prisma.scene.deleteMany({ where: { episodeId } });

    const [brandRow, characters, locations] = await Promise.all([
      prisma.brandBible.findFirst({ where: { channelId: episode.channelId }, orderBy: { version: "desc" } }),
      prisma.character.findMany({ where: { channelId: episode.channelId, deletedAt: null } }),
      prisma.location.findMany({ where: { world: { channelId: episode.channelId } } }),
    ]);
    const brand = brandRow?.data as unknown as BrandBible | undefined;

    for (const sceneDraft of script.scenes) {
      const location = locations.find((l) => l.name === sceneDraft.locationName);
      const scene = await prisma.scene.create({
        data: {
          episodeId,
          sceneNumber: sceneDraft.sceneNumber,
          durationEstimateSeconds: sceneDraft.durationEstimateSeconds,
          locationId: location?.id,
          purpose: sceneDraft.purpose,
          action: sceneDraft.action,
          dialogue: sceneDraft.dialogue,
          narration: sceneDraft.narration,
          emotion: sceneDraft.emotion,
          visualDescription: sceneDraft.visualDescription,
          transition: sceneDraft.transition,
          continuityNotes: sceneDraft.continuityNotes,
          characters: {
            create: characters
              .filter((c) => sceneDraft.characterNames.includes(c.name))
              .map((c) => ({ characterId: c.id })),
          },
        },
      });

      const sceneCharacters = characters
        .filter((c) => sceneDraft.characterNames.includes(c.name))
        .map((c) => ({ id: c.id, name: c.name, visualPrompt: c.visualPrompt, negativePrompt: c.negativePrompt }));

      const directorSpec = directorEngine.compileScene({
        scene: sceneDraft,
        sceneId: scene.id,
        characters: sceneCharacters,
        location: location ? { id: location.id, name: location.name, visualPrompt: location.visualPrompt, negativePrompt: location.negativePrompt } : undefined,
        visualStyle: brand?.style.illustrationStyle ?? "clean modern illustration",
      });

      await prisma.scene.update({ where: { id: scene.id }, data: { directorSpec: directorSpec as never } });
      await prisma.shot.create({
        data: {
          sceneId: scene.id,
          shotNumber: 1,
          shotType: directorSpec.camera.shotType,
          cameraMovement: directorSpec.camera.movement,
          durationEstimateSeconds: sceneDraft.durationEstimateSeconds,
          description: sceneDraft.visualDescription,
          directorSpec: directorSpec as never,
        },
      });
    }

    await markCompleted(jobRunId, { sceneCount: script.scenes.length });
    await enqueueNext("GENERATE_IMAGE", { episodeId, channelId: episode.channelId });
  } catch (err) {
    log.error({ err, episodeId }, "scene breakdown failed");
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "FAILED", lastError: err instanceof Error ? err.message : String(err) } }).catch(() => undefined);
    await publishEpisodeProgress({ episodeId, status: "FAILED", progress: 0, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
    await markFailedOrRetry(jobRunId, "BREAKDOWN_EPISODE", payload as unknown as Record<string, unknown>, err);
  }
}
