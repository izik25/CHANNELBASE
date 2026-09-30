import { prisma } from "@channelbase/database";
import { ThumbnailEngine } from "@channelbase/channel-brain";
import { PromptCompiler } from "@channelbase/ai";
import type { BrandBible, ChannelSpec } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { providerRouter } from "../lib/provider-router.js";
import { RouterBackedLLMProvider } from "../lib/llm-adapter.js";
import { markCompleted, markFailedOrRetry, markRunning, enqueueNext } from "../lib/job-run.js";
import { publishEpisodeProgress } from "../lib/pubsub.js";
import { generateThumbnailAsset } from "../services/asset-generation.js";

const log = createLogger("worker:generate-thumbnail");
const thumbnailEngine = new ThumbnailEngine(new RouterBackedLLMProvider(providerRouter));
const promptCompiler = new PromptCompiler();

export interface GenerateThumbnailPayload {
  jobRunId: string;
  episodeId: string;
  channelId?: string;
}

export async function processGenerateThumbnail(payload: GenerateThumbnailPayload): Promise<void> {
  const { jobRunId, episodeId } = payload;
  await markRunning(jobRunId, "ASSEMBLY");

  try {
    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    await publishEpisodeProgress({ episodeId, status: "ASSEMBLY", progress: 88, message: "Designing the thumbnail", timestamp: new Date().toISOString() });

    const [specVersion, brandRow, characters] = await Promise.all([
      prisma.channelSpecVersion.findFirst({ where: { channelId: episode.channelId }, orderBy: { version: "desc" } }),
      prisma.brandBible.findFirst({ where: { channelId: episode.channelId }, orderBy: { version: "desc" } }),
      prisma.character.findMany({ where: { channelId: episode.channelId, deletedAt: null }, select: { name: true } }),
    ]);
    const spec = specVersion?.spec as unknown as ChannelSpec;
    const brand = brandRow?.data as unknown as BrandBible;
    if (!spec || !brand) throw new Error("Channel is missing ChannelSpec/BrandBible.");

    const thumbSpec = await thumbnailEngine.generate({
      spec,
      brand,
      episodeTitle: episode.title,
      episodeSummary: episode.summary ?? episode.title,
      characterNames: characters.map((c) => c.name),
    });

    const request = promptCompiler.compileThumbnailRequest({ spec: thumbSpec, brand, idempotencyKey: `thumbnail:${episodeId}` });
    await generateThumbnailAsset({ channelId: episode.channelId, episodeId, prompt: request.prompt, negativePrompt: request.negativePrompt, width: request.width ?? 1280, height: request.height ?? 720 });

    await markCompleted(jobRunId, { episodeId });
    await enqueueNext("GENERATE_METADATA", { episodeId, channelId: episode.channelId });
  } catch (err) {
    log.error({ err, episodeId }, "thumbnail stage failed");
    await publishEpisodeProgress({ episodeId, status: "FAILED", progress: 0, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
    await markFailedOrRetry(jobRunId, "GENERATE_THUMBNAIL", payload as unknown as Record<string, unknown>, err);
  }
}
