import { prisma } from "@channelbase/database";
import { BrandEngine } from "@channelbase/channel-brain";
import type { ChannelSpec } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { providerRouter } from "../lib/provider-router.js";
import { RouterBackedLLMProvider } from "../lib/llm-adapter.js";
import { markCompleted, markFailedOrRetry, markRunning } from "../lib/job-run.js";
import { generateBrandAsset } from "../services/asset-generation.js";

const log = createLogger("worker:generate-brand");
const brandEngine = new BrandEngine(new RouterBackedLLMProvider(providerRouter));

export interface GenerateBrandPayload {
  jobRunId: string;
  channelId: string;
}

/** Standalone brand regeneration — e.g. a future "Regenerate brand" action from channel settings. Not part of the initial CREATE_CHANNEL chain (which calls BrandEngine inline). */
export async function processGenerateBrand(payload: GenerateBrandPayload): Promise<void> {
  const { jobRunId, channelId } = payload;
  await markRunning(jobRunId, "brand");

  try {
    const specVersion = await prisma.channelSpecVersion.findFirstOrThrow({ where: { channelId }, orderBy: { version: "desc" } });
    const spec = specVersion.spec as unknown as ChannelSpec;
    const brand = await brandEngine.generate(spec);

    const latest = await prisma.brandBible.findFirst({ where: { channelId }, orderBy: { version: "desc" } });
    const nextVersion = (latest?.version ?? 0) + 1;
    await prisma.brandBible.create({ data: { channelId, version: nextVersion, data: brand as never } });
    await Promise.all((["LOGO", "AVATAR", "BANNER"] as const).map((kind) => generateBrandAsset({ channelId, kind, brand })));

    log.info({ channelId, version: nextVersion }, "brand regenerated");
    await markCompleted(jobRunId, { version: nextVersion });
  } catch (err) {
    log.error({ err, channelId }, "brand regeneration failed");
    await markFailedOrRetry(jobRunId, "GENERATE_BRAND", payload as unknown as Record<string, unknown>, err);
  }
}
