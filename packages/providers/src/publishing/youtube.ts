import { Readable } from "node:stream";
import { google } from "googleapis";
import { createLogger } from "@channelbase/logger";
import { ProviderNotConfiguredError } from "../errors.js";
import type {
  ConnectAccountParams,
  ConnectedAccountInfo,
  PlatformAnalyticsPoint,
  PublishResult,
  PublishVideoParams,
  PublishingProvider,
  StorageProvider,
} from "../interfaces.js";

const log = createLogger("provider:publishing:youtube");

/**
 * Real YouTube Data API v3 adapter. Requires a Google Cloud OAuth client with
 * the YouTube Data API enabled and the following scopes granted on connect:
 *   - https://www.googleapis.com/auth/youtube.upload
 *   - https://www.googleapis.com/auth/youtube.readonly
 *
 * Activation steps:
 *   1. Create OAuth 2.0 credentials in Google Cloud Console, enable "YouTube Data API v3".
 *   2. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI in .env.
 *   3. Set FEATURE_YOUTUBE_PUBLISHING=true.
 *   4. Wire the OAuth consent redirect in apps/api (see routes/platform-accounts.ts) to
 *      request the scopes above, then call connectAccount() with the returned code.
 *
 * getAnalytics() requires the separate YouTube Analytics API (scope
 * https://www.googleapis.com/auth/yt-analytics.readonly) which is NOT wired here —
 * it's left as a documented TODO rather than guessed at, since its report
 * dimensions/metrics query shape is easy to get subtly wrong.
 */
export class YouTubePublishingProvider implements PublishingProvider {
  readonly name = "youtube";
  readonly isMock = false;
  readonly platform = "YOUTUBE" as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    private readonly storage: StorageProvider,
  ) {
    if (!clientId || !clientSecret) {
      throw new Error("YouTubePublishingProvider requires YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET.");
    }
  }

  private oauthClient() {
    return new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
  }

  async connectAccount({ authorizationCode }: ConnectAccountParams): Promise<ConnectedAccountInfo> {
    const oauth2Client = this.oauthClient();
    const { tokens } = await oauth2Client.getToken(authorizationCode);
    oauth2Client.setCredentials(tokens);

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const channelsResponse = await youtube.channels.list({ part: ["snippet"], mine: true });
    const channel = channelsResponse.data.items?.[0];
    if (!channel?.id) {
      throw new Error("Could not resolve the connected Google account's YouTube channel.");
    }

    return {
      externalAccountId: channel.id,
      channelName: channel.snippet?.title ?? undefined,
      accessToken: tokens.access_token ?? "",
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    };
  }

  async publishVideo(params: PublishVideoParams): Promise<PublishResult> {
    return this.upload(params, "public");
  }

  async scheduleVideo(params: PublishVideoParams & { publishAt: Date }): Promise<PublishResult> {
    return this.upload(params, "private", params.publishAt);
  }

  private async upload(params: PublishVideoParams, privacyStatus: "public" | "private", publishAt?: Date): Promise<PublishResult> {
    const oauth2Client = this.oauthClient();
    oauth2Client.setCredentials({ access_token: params.accessToken });
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const videoBuffer = await this.storage.get(params.videoStorageKey);

    log.info({ title: params.title }, "uploading video to YouTube");
    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title: params.title, description: params.description, tags: params.tags },
        status: {
          privacyStatus,
          publishAt: publishAt?.toISOString(),
          selfDeclaredMadeForKids: false,
        },
      },
      media: { body: bufferToStream(videoBuffer) },
    });

    const videoId = response.data.id;
    if (!videoId) throw new Error("YouTube upload succeeded but returned no video id.");

    if (params.thumbnailStorageKey) {
      await this.uploadThumbnail({ accessToken: params.accessToken, externalContentId: videoId, thumbnailStorageKey: params.thumbnailStorageKey });
    }

    return {
      externalContentId: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      status: publishAt ? "SCHEDULED" : "PUBLISHED",
    };
  }

  async uploadThumbnail({ accessToken, externalContentId, thumbnailStorageKey }: { accessToken: string; externalContentId: string; thumbnailStorageKey: string }): Promise<void> {
    const oauth2Client = this.oauthClient();
    oauth2Client.setCredentials({ access_token: accessToken });
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const thumbnailBuffer = await this.storage.get(thumbnailStorageKey);
    await youtube.thumbnails.set({ videoId: externalContentId, media: { body: bufferToStream(thumbnailBuffer) } });
  }

  async getAnalytics(_params: { accessToken: string; externalContentId: string }): Promise<PlatformAnalyticsPoint> {
    throw new ProviderNotConfiguredError(
      this.name,
      "getAnalytics requires wiring the YouTube Analytics API (scope yt-analytics.readonly) — see the class doc comment for details.",
    );
  }
}

function bufferToStream(buffer: Buffer) {
  return Readable.from(buffer);
}
