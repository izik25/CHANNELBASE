import { Redis } from "ioredis";
import { env } from "@channelbase/config";
import type { ChannelBuildProgressEvent } from "@channelbase/shared";

const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export async function publishBuildProgress(event: ChannelBuildProgressEvent): Promise<void> {
  await publisher.publish(`channel-build:${event.channelId}`, JSON.stringify(event));
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
  await publisher.publish(`episode-progress:${event.episodeId}`, JSON.stringify(event));
}
