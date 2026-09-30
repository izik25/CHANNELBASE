import { ProviderNotConfiguredError } from "../errors.js";
import type {
  ConnectAccountParams,
  ConnectedAccountInfo,
  PlatformAnalyticsPoint,
  PublishResult,
  PublishVideoParams,
  PublishingProvider,
} from "../interfaces.js";

/**
 * STUB — shared by TikTok/Instagram/Facebook until each is implemented. V1
 * prioritizes YouTube (see ./youtube.ts); these exist so the ProviderRouter,
 * PlatformAccount schema, and publishing UI can already reference every
 * platform without special-casing "not built yet" logic throughout the app.
 *
 * To activate a given platform:
 *   1. Register a developer app with that platform (TikTok for Developers /
 *      Meta for Developers) and review its current Content Publishing API docs.
 *   2. Implement connectAccount (OAuth code exchange), publishVideo/scheduleVideo
 *      (their upload/publish endpoint), uploadThumbnail if supported, and
 *      getAnalytics against their insights endpoint.
 *   3. Set the platform's *_CLIENT_ID / *_CLIENT_SECRET in .env and register the
 *      class in packages/providers/src/router/registry.ts.
 */
abstract class StubPublishingProvider implements PublishingProvider {
  abstract readonly name: string;
  abstract readonly platform: "TIKTOK" | "INSTAGRAM" | "FACEBOOK";
  readonly isMock = false;

  private fail(): never {
    throw new ProviderNotConfiguredError(this.name, `Implement packages/providers/src/publishing/stubs.ts (${this.name}) before use.`);
  }

  async connectAccount(_params: ConnectAccountParams): Promise<ConnectedAccountInfo> {
    return this.fail();
  }
  async publishVideo(_params: PublishVideoParams): Promise<PublishResult> {
    return this.fail();
  }
  async scheduleVideo(_params: PublishVideoParams & { publishAt: Date }): Promise<PublishResult> {
    return this.fail();
  }
  async uploadThumbnail(): Promise<void> {
    return this.fail();
  }
  async getAnalytics(): Promise<PlatformAnalyticsPoint> {
    return this.fail();
  }
}

export class TikTokPublishingProvider extends StubPublishingProvider {
  readonly name = "tiktok";
  readonly platform = "TIKTOK" as const;
}

export class InstagramPublishingProvider extends StubPublishingProvider {
  readonly name = "instagram";
  readonly platform = "INSTAGRAM" as const;
}

export class FacebookPublishingProvider extends StubPublishingProvider {
  readonly name = "facebook";
  readonly platform = "FACEBOOK" as const;
}
