import { createLogger } from "@channelbase/logger";
import type {
  ConnectAccountParams,
  ConnectedAccountInfo,
  PlatformAnalyticsPoint,
  PublishResult,
  PublishVideoParams,
  PublishingProvider,
} from "../interfaces.js";

const log = createLogger("provider:publishing:mock-youtube");

/**
 * Simulates a full YouTube publishing lifecycle without ever calling Google.
 * Used whenever FEATURE_YOUTUBE_PUBLISHING is off or no OAuth client is
 * configured — the rest of the publishing pipeline (metadata, thumbnails,
 * PublishedContent rows, analytics ingestion) exercises the exact same code
 * path it would against the real adapter.
 */
export class MockYouTubePublishingProvider implements PublishingProvider {
  readonly name = "mock-youtube";
  readonly isMock = true;
  readonly platform = "YOUTUBE" as const;

  async connectAccount(_params: ConnectAccountParams): Promise<ConnectedAccountInfo> {
    const id = `mock-yt-account-${Date.now()}`;
    log.debug({ id }, "mock YouTube account connected");
    return {
      externalAccountId: id,
      channelName: "Mock YouTube Channel",
      accessToken: `mock-access-${id}`,
      refreshToken: `mock-refresh-${id}`,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }

  async publishVideo(params: PublishVideoParams): Promise<PublishResult> {
    const id = `mock-video-${Date.now()}`;
    log.info({ id, title: params.title }, "[MOCK] published video (no real upload occurred)");
    return { externalContentId: id, url: `https://www.youtube.com/watch?v=${id}`, status: "PUBLISHED" };
  }

  async scheduleVideo(params: PublishVideoParams & { publishAt: Date }): Promise<PublishResult> {
    const id = `mock-video-${Date.now()}`;
    log.info({ id, publishAt: params.publishAt }, "[MOCK] scheduled video (no real upload occurred)");
    return { externalContentId: id, url: `https://www.youtube.com/watch?v=${id}`, status: "SCHEDULED" };
  }

  async uploadThumbnail(): Promise<void> {
    log.info("[MOCK] thumbnail upload acknowledged");
  }

  async getAnalytics(): Promise<PlatformAnalyticsPoint> {
    const views = Math.floor(Math.random() * 5000);
    return {
      views,
      impressions: views * 8,
      clickThroughRate: 0.04 + Math.random() * 0.03,
      watchTimeSeconds: views * 120,
      averageViewDuration: 95 + Math.random() * 60,
      retention: 0.45 + Math.random() * 0.2,
      likes: Math.floor(views * 0.05),
      comments: Math.floor(views * 0.01),
      shares: Math.floor(views * 0.008),
      subscribersGained: Math.floor(views * 0.006),
      revenueUsd: Number((views * 0.002).toFixed(2)),
      capturedAt: new Date(),
    };
  }
}
