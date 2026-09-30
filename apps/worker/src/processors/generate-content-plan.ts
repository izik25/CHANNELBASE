import { prisma } from "@channelbase/database";
import { ContentPlanEngine } from "@channelbase/channel-brain";
import type { ChannelSpec } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { providerRouter } from "../lib/provider-router.js";
import { RouterBackedLLMProvider } from "../lib/llm-adapter.js";
import { markCompleted, markFailedOrRetry, markRunning } from "../lib/job-run.js";

const log = createLogger("worker:generate-content-plan");
const contentPlanEngine = new ContentPlanEngine(new RouterBackedLLMProvider(providerRouter));

export interface GenerateContentPlanPayload {
  jobRunId: string;
  channelId: string;
  periodStart?: string;
  periodEnd?: string;
}

/** Generates the NEXT 30-day content calendar, e.g. once the current period runs out. */
export async function processGenerateContentPlan(payload: GenerateContentPlanPayload): Promise<void> {
  const { jobRunId, channelId } = payload;
  await markRunning(jobRunId, "content-plan");

  try {
    const specVersion = await prisma.channelSpecVersion.findFirstOrThrow({ where: { channelId }, orderBy: { version: "desc" } });
    const spec = specVersion.spec as unknown as ChannelSpec;

    const periodStart = payload.periodStart ? new Date(payload.periodStart) : new Date();
    const periodEnd = payload.periodEnd ? new Date(payload.periodEnd) : new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

    const draft = await contentPlanEngine.generate(spec, periodStart, periodEnd);
    const plan = await prisma.contentPlan.create({
      data: {
        channelId,
        periodStart,
        periodEnd,
        items: {
          create: draft.items.map((item) => ({
            titleIdea: item.titleIdea,
            concept: item.concept,
            contentPillar: item.contentPillar,
            series: item.series,
            format: item.format,
            targetDurationSeconds: item.targetDurationSeconds,
            hook: item.hook,
            educationalGoal: item.educationalGoal,
            emotionalGoal: item.emotionalGoal,
            targetPublishDate: new Date(item.targetPublishDate),
            priority: item.priority,
          })),
        },
      },
    });

    log.info({ channelId, planId: plan.id, itemCount: draft.items.length }, "content plan generated");
    await markCompleted(jobRunId, { planId: plan.id, itemCount: draft.items.length });
  } catch (err) {
    log.error({ err, channelId }, "content plan generation failed");
    await markFailedOrRetry(jobRunId, "GENERATE_CONTENT_PLAN", payload as unknown as Record<string, unknown>, err);
  }
}
