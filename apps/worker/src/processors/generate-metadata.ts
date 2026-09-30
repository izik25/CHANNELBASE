import { prisma } from "@channelbase/database";
import { MetadataEngine, QualityEngine } from "@channelbase/channel-brain";
import type { ChannelSpec, EpisodeScript } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { providerRouter } from "../lib/provider-router.js";
import { RouterBackedLLMProvider } from "../lib/llm-adapter.js";
import { markCompleted, markFailedOrRetry, markRunning } from "../lib/job-run.js";
import { publishEpisodeProgress } from "../lib/pubsub.js";

const log = createLogger("worker:generate-metadata");
const llm = new RouterBackedLLMProvider(providerRouter);
const metadataEngine = new MetadataEngine(llm);
const qualityEngine = new QualityEngine(llm);

export interface GenerateMetadataPayload {
  jobRunId: string;
  episodeId: string;
  channelId?: string;
}

export async function processGenerateMetadata(payload: GenerateMetadataPayload): Promise<void> {
  const { jobRunId, episodeId } = payload;
  await markRunning(jobRunId, "QUALITY_REVIEW");

  try {
    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    await publishEpisodeProgress({ episodeId, status: "QUALITY_REVIEW", progress: 94, message: "Writing title, description and tags", timestamp: new Date().toISOString() });

    const specVersion = await prisma.channelSpecVersion.findFirst({ where: { channelId: episode.channelId }, orderBy: { version: "desc" } });
    const spec = specVersion?.spec as unknown as ChannelSpec;
    const script = episode.script as unknown as EpisodeScript;
    if (!spec || !script) throw new Error("Channel/episode missing ChannelSpec or script for metadata generation.");

    const metadata = await metadataEngine.generate({ spec, script });
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "QUALITY_REVIEW", metadata: metadata as never, title: metadata.recommendedTitle } });

    const [assets, priorEpisodes] = await Promise.all([
      prisma.asset.findMany({ where: { episodeId } }),
      prisma.episode.findMany({ where: { channelId: episode.channelId, status: { in: ["READY", "SCHEDULED", "PUBLISHED"] }, id: { not: episodeId } }, select: { summary: true }, take: 10, orderBy: { updatedAt: "desc" } }),
    ]);
    const finalAsset = assets.find((a) => a.type === "FINAL_VIDEO");
    const missingAssetCount = assets.filter((a) => a.status === "FAILED").length;

    const qualityResult = await qualityEngine.review({
      script,
      priorEpisodeSummaries: priorEpisodes.map((e) => e.summary ?? "").filter(Boolean),
      targetDurationSeconds: episode.targetDurationSeconds,
      actualDurationSeconds: finalAsset?.durationSeconds ?? episode.targetDurationSeconds,
      missingAssetCount,
      totalAssetCount: assets.length,
    });

    await prisma.qualityReview.create({
      data: { episodeId, overallScore: qualityResult.overallScore, checks: qualityResult.checks as never, riskCategories: qualityResult.riskCategories, notes: qualityResult.notes },
    });

    await prisma.episode.update({ where: { id: episodeId }, data: { status: "READY" } });
    await publishEpisodeProgress({ episodeId, status: "READY", progress: 100, message: "Episode ready", timestamp: new Date().toISOString() });

    log.info({ episodeId, qualityScore: qualityResult.overallScore }, "episode reached READY");
    await markCompleted(jobRunId, { qualityScore: qualityResult.overallScore });
  } catch (err) {
    log.error({ err, episodeId }, "metadata/quality stage failed");
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "FAILED", lastError: err instanceof Error ? err.message : String(err) } }).catch(() => undefined);
    await publishEpisodeProgress({ episodeId, status: "FAILED", progress: 0, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
    await markFailedOrRetry(jobRunId, "GENERATE_METADATA", payload as unknown as Record<string, unknown>, err);
  }
}
