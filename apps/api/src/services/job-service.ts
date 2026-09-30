import { Prisma, prisma } from "@channelbase/database";
import type { JobType } from "@channelbase/shared";
import { enqueueJob } from "../lib/queue.js";

export interface CreateJobRunParams {
  jobType: JobType;
  entityId: string;
  channelId?: string;
  episodeId?: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  maxAttempts?: number;
}

/**
 * Creates the durable JobRun row THEN enqueues the BullMQ job — the DB row
 * is the source of truth the UI/API read from; BullMQ only drives execution.
 * If `idempotencyKey` matches an existing non-failed JobRun, returns that
 * row instead of creating a duplicate (used so retried "Build Channel"
 * clicks or duplicate webhook deliveries can't double-run a workflow).
 */
export async function createAndEnqueueJobRun(params: CreateJobRunParams) {
  if (params.idempotencyKey) {
    const existing = await prisma.jobRun.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
    if (existing && existing.status !== "FAILED") return existing;
  }

  const jobRun = await prisma.jobRun.create({
    data: {
      jobType: params.jobType,
      entityId: params.entityId,
      channelId: params.channelId,
      episodeId: params.episodeId,
      payload: params.payload as Prisma.InputJsonValue | undefined,
      idempotencyKey: params.idempotencyKey,
      maxAttempts: params.maxAttempts ?? 3,
      status: "PENDING",
    },
  });

  await enqueueJob(params.jobType, { jobRunId: jobRun.id, ...params.payload });
  return jobRun;
}
