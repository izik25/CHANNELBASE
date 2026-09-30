import { prisma } from "@channelbase/database";
import { MediaComposer, type ComposableAsset } from "@channelbase/production";
import { createLogger } from "@channelbase/logger";
import { markCompleted, markFailedOrRetry, markRunning, enqueueNext } from "../lib/job-run.js";
import { publishEpisodeProgress } from "../lib/pubsub.js";
import { storage } from "../lib/provider-router.js";

const log = createLogger("worker:assemble-video");
const composer = new MediaComposer(storage);

export interface AssembleVideoPayload {
  jobRunId: string;
  episodeId: string;
  channelId?: string;
}

export function toSrtTimestamp(totalSeconds: number): string {
  const ms = Math.round((totalSeconds % 1) * 1000);
  const totalWhole = Math.floor(totalSeconds);
  const h = Math.floor(totalWhole / 3600);
  const m = Math.floor((totalWhole % 3600) / 60);
  const s = totalWhole % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export async function processAssembleVideo(payload: AssembleVideoPayload): Promise<void> {
  const { jobRunId, episodeId } = payload;
  await markRunning(jobRunId, "ASSEMBLY");

  try {
    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "ASSEMBLY" } });
    await publishEpisodeProgress({ episodeId, status: "ASSEMBLY", progress: 80, message: "Assembling the final cut", timestamp: new Date().toISOString() });

    const scenes = await prisma.scene.findMany({ where: { episodeId }, orderBy: { sceneNumber: "asc" } });
    const [videoAssets, musicAsset, logoAsset] = await Promise.all([
      prisma.asset.findMany({ where: { episodeId, type: "VIDEO", status: "READY" } }),
      prisma.asset.findFirst({ where: { episodeId, type: "MUSIC", status: "READY" } }),
      prisma.asset.findFirst({ where: { channelId: episode.channelId, type: "LOGO", status: "READY" } }),
    ]);

    const clips: ComposableAsset[] = scenes
      .map((scene) => {
        const asset = videoAssets.find((a) => a.sceneId === scene.id);
        return asset?.storageKey && asset.mimeType ? { storageKey: asset.storageKey, mimeType: asset.mimeType, durationSeconds: asset.durationSeconds ?? scene.durationEstimateSeconds } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (clips.length === 0) throw new Error("No READY video assets available to assemble — all scene video generations may have failed.");

    let cursor = 0;
    const srtBlocks = scenes
      .map((scene, i) => {
        const text = scene.narration ?? "";
        if (!text.trim()) {
          cursor += scene.durationEstimateSeconds;
          return null;
        }
        const start = cursor;
        cursor += scene.durationEstimateSeconds;
        return `${i + 1}\n${toSrtTimestamp(start)} --> ${toSrtTimestamp(cursor)}\n${text}\n`;
      })
      .filter(Boolean);

    const result = await composer.composeEpisode({
      clips,
      music: musicAsset?.storageKey && musicAsset.mimeType ? { storageKey: musicAsset.storageKey, mimeType: musicAsset.mimeType, durationSeconds: musicAsset.durationSeconds ?? undefined } : undefined,
      logo: logoAsset?.storageKey && logoAsset.mimeType ? { storageKey: logoAsset.storageKey, mimeType: logoAsset.mimeType } : undefined,
      subtitleSrt: srtBlocks.length ? srtBlocks.join("\n") : undefined,
      idempotencyKey: `final:${episodeId}`,
    });

    const finalAsset = await prisma.asset.upsert({
      where: { idempotencyKey: `final:${episodeId}` },
      update: { status: result.status, storageKey: result.storageKey, url: result.url, durationSeconds: result.durationSeconds, mimeType: result.mimeType, generationMetadata: result.metadata as never },
      create: {
        channelId: episode.channelId,
        episodeId,
        type: "FINAL_VIDEO",
        status: result.status,
        storageKey: result.storageKey,
        url: result.url,
        durationSeconds: result.durationSeconds,
        mimeType: result.mimeType,
        generationMetadata: result.metadata as never,
        idempotencyKey: `final:${episodeId}`,
      },
    });

    await prisma.episode.update({ where: { id: episodeId }, data: { finalAssetId: finalAsset.id } });
    log.info({ episodeId, finalAssetId: finalAsset.id }, "episode assembled");

    await markCompleted(jobRunId, { finalAssetId: finalAsset.id });
    await enqueueNext("GENERATE_THUMBNAIL", { episodeId, channelId: episode.channelId });
  } catch (err) {
    log.error({ err, episodeId }, "assembly stage failed");
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "FAILED", lastError: err instanceof Error ? err.message : String(err) } }).catch(() => undefined);
    await publishEpisodeProgress({ episodeId, status: "FAILED", progress: 0, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
    await markFailedOrRetry(jobRunId, "ASSEMBLE_VIDEO", payload as unknown as Record<string, unknown>, err);
  }
}
