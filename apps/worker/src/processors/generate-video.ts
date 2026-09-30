import { prisma } from "@channelbase/database";
import type { DirectorSpec } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { markCompleted, markFailedOrRetry, markRunning, enqueueNext } from "../lib/job-run.js";
import { publishEpisodeProgress } from "../lib/pubsub.js";
import { generateSceneVideoAsset } from "../services/asset-generation.js";

const log = createLogger("worker:generate-video");

export interface GenerateVideoPayload {
  jobRunId: string;
  episodeId: string;
  channelId?: string;
  assetId?: string;
}

export async function processGenerateVideo(payload: GenerateVideoPayload): Promise<void> {
  const { jobRunId, episodeId } = payload;
  await markRunning(jobRunId, "VIDEO_GENERATION");

  try {
    if (payload.assetId) {
      const asset = await prisma.asset.findUniqueOrThrow({ where: { id: payload.assetId }, include: { scene: true } });
      if (!asset.sceneId || !asset.scene?.directorSpec) throw new Error("Asset has no associated scene DirectorSpec to regenerate from.");
      await generateSceneVideoAsset({ channelId: asset.channelId, episodeId, sceneId: asset.sceneId, directorSpec: asset.scene.directorSpec as unknown as DirectorSpec });
      await markCompleted(jobRunId, { regenerated: asset.id });
      return;
    }

    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "VIDEO_GENERATION" } });
    await publishEpisodeProgress({ episodeId, status: "VIDEO_GENERATION", progress: 62, message: "Generating scene motion", timestamp: new Date().toISOString() });

    const scenes = await prisma.scene.findMany({ where: { episodeId }, orderBy: { sceneNumber: "asc" } });
    let failures = 0;
    for (const scene of scenes) {
      if (!scene.directorSpec) continue;
      const asset = await generateSceneVideoAsset({ channelId: episode.channelId, episodeId, sceneId: scene.id, directorSpec: scene.directorSpec as unknown as DirectorSpec });
      if (asset.status === "FAILED") failures += 1;
    }

    log.info({ episodeId, sceneCount: scenes.length, failures }, "scene video generation pass complete");
    await markCompleted(jobRunId, { sceneCount: scenes.length, failures });
    await enqueueNext("GENERATE_MUSIC", { episodeId, channelId: episode.channelId });
  } catch (err) {
    log.error({ err, episodeId }, "video generation stage failed");
    await publishEpisodeProgress({ episodeId, status: "FAILED", progress: 0, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
    await markFailedOrRetry(jobRunId, "GENERATE_VIDEO", payload as unknown as Record<string, unknown>, err);
  }
}
