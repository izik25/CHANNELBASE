import { prisma } from "@channelbase/database";
import type { BrandBible, DirectorSpec } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { markCompleted, markFailedOrRetry, markRunning, enqueueNext } from "../lib/job-run.js";
import { publishEpisodeProgress } from "../lib/pubsub.js";
import { generateSceneImageAsset } from "../services/asset-generation.js";

const log = createLogger("worker:generate-image");

export interface GenerateImagePayload {
  jobRunId: string;
  episodeId: string;
  channelId?: string;
  assetId?: string;
  regenerate?: boolean;
}

export async function processGenerateImage(payload: GenerateImagePayload): Promise<void> {
  const { jobRunId, episodeId } = payload;
  await markRunning(jobRunId, "ASSET_GENERATION");

  try {
    if (payload.assetId) {
      const asset = await prisma.asset.findUniqueOrThrow({ where: { id: payload.assetId }, include: { scene: true } });
      if (!asset.sceneId || !asset.scene?.directorSpec) throw new Error("Asset has no associated scene DirectorSpec to regenerate from.");
      await generateSceneImageAsset({
        channelId: asset.channelId,
        episodeId,
        sceneId: asset.sceneId,
        directorSpec: asset.scene.directorSpec as unknown as DirectorSpec,
        brand: (await currentBrand(asset.channelId))!,
      });
      await markCompleted(jobRunId, { regenerated: asset.id });
      return;
    }

    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "ASSET_GENERATION" } });
    await publishEpisodeProgress({ episodeId, status: "ASSET_GENERATION", progress: 28, message: "Generating scene visuals", timestamp: new Date().toISOString() });

    const brand = await currentBrand(episode.channelId);
    if (!brand) throw new Error("Channel has no BrandBible — cannot generate on-brand images.");

    const scenes = await prisma.scene.findMany({ where: { episodeId }, orderBy: { sceneNumber: "asc" } });
    let failures = 0;
    for (const scene of scenes) {
      if (!scene.directorSpec) continue;
      const asset = await generateSceneImageAsset({ channelId: episode.channelId, episodeId, sceneId: scene.id, directorSpec: scene.directorSpec as unknown as DirectorSpec, brand });
      if (asset.status === "FAILED") failures += 1;
    }

    log.info({ episodeId, sceneCount: scenes.length, failures }, "scene image generation pass complete");
    await markCompleted(jobRunId, { sceneCount: scenes.length, failures });
    await enqueueNext("GENERATE_VOICE", { episodeId, channelId: episode.channelId });
  } catch (err) {
    log.error({ err, episodeId }, "image generation stage failed");
    await publishEpisodeProgress({ episodeId, status: "FAILED", progress: 0, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
    await markFailedOrRetry(jobRunId, "GENERATE_IMAGE", payload as unknown as Record<string, unknown>, err);
  }
}

async function currentBrand(channelId: string): Promise<BrandBible | null> {
  const row = await prisma.brandBible.findFirst({ where: { channelId }, orderBy: { version: "desc" } });
  return (row?.data as unknown as BrandBible) ?? null;
}
