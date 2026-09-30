import { prisma } from "@channelbase/database";
import type { ChannelSpec } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { markCompleted, markFailedOrRetry, markRunning, enqueueNext } from "../lib/job-run.js";
import { publishEpisodeProgress } from "../lib/pubsub.js";
import { generateEpisodeMusicAsset } from "../services/asset-generation.js";

const log = createLogger("worker:generate-music");

export interface GenerateMusicPayload {
  jobRunId: string;
  episodeId: string;
  channelId?: string;
}

export async function processGenerateMusic(payload: GenerateMusicPayload): Promise<void> {
  const { jobRunId, episodeId } = payload;
  await markRunning(jobRunId, "VIDEO_GENERATION");

  try {
    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    await publishEpisodeProgress({ episodeId, status: "VIDEO_GENERATION", progress: 72, message: "Composing the music bed", timestamp: new Date().toISOString() });

    const specVersion = await prisma.channelSpecVersion.findFirst({ where: { channelId: episode.channelId }, orderBy: { version: "desc" } });
    const spec = specVersion?.spec as unknown as ChannelSpec | undefined;

    // Match the music bed to how long the episode actually turned out to be, not the
    // content plan's nominal target — scenes rarely sum to exactly the target duration,
    // and a music track longer than the real edit inflates the final composed video's
    // duration well past its actual content (this is what silently produced 8-minute
    // "final videos" out of two 30-second scenes before this fix).
    const scenes = await prisma.scene.findMany({ where: { episodeId }, select: { durationEstimateSeconds: true } });
    const actualDurationSeconds = scenes.reduce((sum, s) => sum + s.durationEstimateSeconds, 0) || episode.targetDurationSeconds;

    await generateEpisodeMusicAsset({
      channelId: episode.channelId,
      episodeId,
      style: spec?.voiceStyle.musicStyle ?? "gentle, upbeat instrumental",
      mood: episode.hook ?? "warm and inviting",
      durationSeconds: actualDurationSeconds,
    });

    await markCompleted(jobRunId, { episodeId });
    await enqueueNext("ASSEMBLE_VIDEO", { episodeId, channelId: episode.channelId });
  } catch (err) {
    log.error({ err, episodeId }, "music generation stage failed");
    await publishEpisodeProgress({ episodeId, status: "FAILED", progress: 0, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
    await markFailedOrRetry(jobRunId, "GENERATE_MUSIC", payload as unknown as Record<string, unknown>, err);
  }
}
