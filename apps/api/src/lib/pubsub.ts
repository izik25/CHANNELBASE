import { Redis } from "ioredis";
import { env } from "@channelbase/config";
import type { ChannelBuildProgressEvent } from "@channelbase/shared";

const CHANNEL_PREFIX = "channel-build:";
const EPISODE_PREFIX = "episode-progress:";

/** Publisher connection — used by job processors (worker) to broadcast progress. Also usable from the API for local/dev single-process testing. */
export const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export async function publishBuildProgress(event: ChannelBuildProgressEvent): Promise<void> {
  await publisher.publish(`${CHANNEL_PREFIX}${event.channelId}`, JSON.stringify(event));
}

/**
 * Opens a dedicated subscriber connection for one channel's build progress stream.
 * Redis pub/sub does not replay missed messages — a subscriber that connects even a
 * moment after a fast (mock-provider) job finishes publishing would otherwise hang
 * forever. This function's promise only resolves once the SUBSCRIBE command has been
 * acknowledged by Redis, so callers MUST `await` it before checking "is this job
 * already done?" in the database — that ordering guarantees no event can fall in the
 * gap between the two checks (see routes/channels.ts and routes/episodes.ts).
 */
export async function subscribeToBuildProgress(channelId: string, onMessage: (event: ChannelBuildProgressEvent) => void): Promise<() => void> {
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const topic = `${CHANNEL_PREFIX}${channelId}`;
  subscriber.on("message", (_channel: string, message: string) => {
    try {
      onMessage(JSON.parse(message) as ChannelBuildProgressEvent);
    } catch {
      // ignore malformed messages
    }
  });
  await subscriber.subscribe(topic);
  return () => {
    subscriber.unsubscribe(topic).catch(() => undefined);
    subscriber.quit().catch(() => undefined);
  };
}

export interface EpisodeProgressEvent {
  episodeId: string;
  status: string;
  progress: number;
  stage?: string;
  message?: string;
  error?: string;
  timestamp: string;
}

export async function publishEpisodeProgress(event: EpisodeProgressEvent): Promise<void> {
  await publisher.publish(`${EPISODE_PREFIX}${event.episodeId}`, JSON.stringify(event));
}

/** See subscribeToBuildProgress's doc comment — same "await subscribe, then check DB" contract applies. */
export async function subscribeToEpisodeProgress(episodeId: string, onMessage: (event: EpisodeProgressEvent) => void): Promise<() => void> {
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const topic = `${EPISODE_PREFIX}${episodeId}`;
  subscriber.on("message", (_channel: string, message: string) => {
    try {
      onMessage(JSON.parse(message) as EpisodeProgressEvent);
    } catch {
      // ignore malformed messages
    }
  });
  await subscriber.subscribe(topic);
  return () => {
    subscriber.unsubscribe(topic).catch(() => undefined);
    subscriber.quit().catch(() => undefined);
  };
}
