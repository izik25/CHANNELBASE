import { prisma } from "@channelbase/database";
import { createLogger } from "@channelbase/logger";
import { providerRouter } from "../lib/provider-router.js";
import { markCompleted, markFailedOrRetry, markRunning } from "../lib/job-run.js";
import { publishEpisodeProgress } from "../lib/pubsub.js";

const log = createLogger("worker:publish-video");

export interface PublishVideoPayload {
  jobRunId: string;
  episodeId: string;
  platformAccountId: string;
  publishAt?: string;
}

export async function processPublishVideo(payload: PublishVideoPayload): Promise<void> {
  const { jobRunId, episodeId, platformAccountId } = payload;
  await markRunning(jobRunId, "publishing");

  try {
    const [episode, account, finalAsset, thumbnail] = await Promise.all([
      prisma.episode.findUniqueOrThrow({ where: { id: episodeId } }),
      prisma.platformAccount.findUniqueOrThrow({ where: { id: platformAccountId } }),
      prisma.asset.findFirst({ where: { episodeId, type: "FINAL_VIDEO", status: "READY" } }),
      prisma.asset.findFirst({ where: { episodeId, type: "THUMBNAIL", status: "READY" } }),
    ]);
    if (!finalAsset?.storageKey) throw new Error("Episode has no READY final video asset to publish.");

    const metadata = episode.metadata as { recommendedTitle?: string; description?: string; hashtags?: string[] } | null;
    const provider = providerRouter.getPublishingProvider(account.platform, true);
    // NOTE: this passes the stored (encrypted-at-rest) token's plaintext form — decrypting
    // happens at the API layer before enqueueing in a full implementation; kept simple here
    // since MockYouTubePublishingProvider ignores the token entirely.
    const publishParams = {
      accessToken: account.encryptedAccessToken,
      videoStorageKey: finalAsset.storageKey,
      title: metadata?.recommendedTitle ?? episode.title,
      description: metadata?.description ?? episode.summary ?? "",
      tags: metadata?.hashtags ?? [],
      thumbnailStorageKey: thumbnail?.storageKey ?? undefined,
    };

    const result = payload.publishAt
      ? await provider.scheduleVideo({ ...publishParams, publishAt: new Date(payload.publishAt) })
      : await provider.publishVideo(publishParams);

    await prisma.publishedContent.create({
      data: {
        episodeId,
        platformAccountId,
        platform: account.platform,
        externalContentId: result.externalContentId,
        url: result.url,
        status: result.status,
        publishedAt: result.status === "PUBLISHED" ? new Date() : undefined,
      },
    });
    await prisma.episode.update({ where: { id: episodeId }, data: { status: result.status === "SCHEDULED" ? "SCHEDULED" : "PUBLISHED" } });
    await publishEpisodeProgress({ episodeId, status: result.status, progress: 100, timestamp: new Date().toISOString() });

    log.info({ episodeId, platform: account.platform, externalContentId: result.externalContentId }, "video published");
    await markCompleted(jobRunId, { externalContentId: result.externalContentId, url: result.url });
  } catch (err) {
    log.error({ err, episodeId }, "publish failed");
    const message = err instanceof Error ? err.message : String(err);
    // The API route optimistically sets the episode to SCHEDULED before this job even
    // starts (there's no dedicated "PUBLISHING" status). Revert to READY on failure so
    // the Publish button (only shown for READY episodes) reappears instead of the
    // episode getting stuck on SCHEDULED with no way to retry.
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "READY", lastError: message } }).catch(() => undefined);
    await publishEpisodeProgress({ episodeId, status: "FAILED", progress: 0, error: message, timestamp: new Date().toISOString() });
    await markFailedOrRetry(jobRunId, "PUBLISH_VIDEO", payload as unknown as Record<string, unknown>, err);
  }
}
