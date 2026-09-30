import { Redis } from "ioredis";
import { env } from "@channelbase/config";

/** Must match apps/api/src/lib/queue.ts — same queue name, same Redis connection string. */
export const QUEUE_NAME = "channelbase-jobs";

export const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
