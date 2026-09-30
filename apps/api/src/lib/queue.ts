import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "@channelbase/config";
import type { JobType } from "@channelbase/shared";

/**
 * Single BullMQ queue shared by the API (producer) and the worker
 * (consumer). Job identity is carried by `job.name` (a JobType) rather than
 * one queue per type — this keeps queue wiring trivial while JobRun rows in
 * Postgres remain the actual source of truth for status/progress (see
 * docs/PRODUCTION_PIPELINE.md).
 */
export const QUEUE_NAME = "channelbase-jobs";

export const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const jobsQueue = new Queue(QUEUE_NAME, { connection });

export interface EnqueueJobPayload {
  jobRunId: string;
  [key: string]: unknown;
}

export async function enqueueJob(jobType: JobType, payload: EnqueueJobPayload, opts?: { delay?: number }): Promise<void> {
  await jobsQueue.add(jobType, payload, {
    jobId: payload.jobRunId,
    attempts: 1, // JobRun-level retry policy is driven by the worker's own retry logic, not BullMQ's
    delay: opts?.delay,
    removeOnComplete: 500,
    removeOnFail: 500,
  });
}
