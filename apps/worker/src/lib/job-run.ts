import { Prisma, prisma } from "@channelbase/database";
import type { JobType } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { Queue } from "bullmq";
import { QUEUE_NAME, connection } from "./queue.js";

const log = createLogger("worker:job-run");
const queue = new Queue(QUEUE_NAME, { connection });

export async function markRunning(jobRunId: string, stage?: string): Promise<void> {
  await prisma.jobRun.update({
    where: { id: jobRunId },
    data: { status: "RUNNING", startedAt: new Date(), stage, attemptCount: { increment: 1 } },
  });
}

export async function markProgress(jobRunId: string, progress: number, stage?: string): Promise<void> {
  await prisma.jobRun.update({ where: { id: jobRunId }, data: { progress, stage } });
}

export async function markCompleted(jobRunId: string, result?: Record<string, unknown>): Promise<void> {
  await prisma.jobRun.update({
    where: { id: jobRunId },
    data: { status: "COMPLETED", progress: 100, completedAt: new Date(), result: result as Prisma.InputJsonValue | undefined },
  });
}

/**
 * Marks a JobRun failed. If attempts remain, re-enqueues with exponential
 * backoff and sets status back to PENDING/RETRYING instead of a terminal
 * FAILED — the admin "retry failed job" action is only needed once attempts
 * are exhausted.
 */
export async function markFailedOrRetry(jobRunId: string, jobType: JobType, payload: Record<string, unknown>, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const jobRun = await prisma.jobRun.findUniqueOrThrow({ where: { id: jobRunId } });

  if (jobRun.attemptCount < jobRun.maxAttempts) {
    await prisma.jobRun.update({ where: { id: jobRunId }, data: { status: "RETRYING", error: message } });
    const delayMs = 2 ** jobRun.attemptCount * 2000;
    log.warn({ jobRunId, jobType, attempt: jobRun.attemptCount, delayMs }, "job failed, retrying with backoff");
    await queue.add(jobType, payload, { jobId: `${jobRunId}-retry-${jobRun.attemptCount}`, delay: delayMs, removeOnComplete: 500, removeOnFail: 500 });
  } else {
    await prisma.jobRun.update({ where: { id: jobRunId }, data: { status: "FAILED", error: message } });
    log.error({ jobRunId, jobType, error: message }, "job failed permanently after exhausting retries");
  }
}

export async function enqueueNext(jobType: JobType, payload: Record<string, unknown> & { jobRunId?: string }): Promise<string> {
  const jobRun = await prisma.jobRun.create({
    data: {
      jobType,
      entityId: (payload.episodeId as string | undefined) ?? (payload.channelId as string | undefined) ?? "unknown",
      channelId: payload.channelId as string | undefined,
      episodeId: payload.episodeId as string | undefined,
      payload: payload as Prisma.InputJsonValue,
      status: "PENDING",
    },
  });
  await queue.add(jobType, { ...payload, jobRunId: jobRun.id }, { jobId: jobRun.id, removeOnComplete: 500, removeOnFail: 500 });
  return jobRun.id;
}
