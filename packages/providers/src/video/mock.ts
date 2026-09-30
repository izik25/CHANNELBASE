import { createLogger } from "@channelbase/logger";
import type { GenerationResult } from "@channelbase/shared";
import type { ExtendVideoRequest, ImageToVideoRequest, StorageProvider, VideoGenerationRequest, VideoProvider } from "../interfaces.js";
import { generateTestClip, isFfmpegAvailable } from "../util/placeholders.js";

const log = createLogger("provider:video:mock");

export class MockVideoProvider implements VideoProvider {
  readonly name = "mock-video";
  readonly isMock = true;

  constructor(private readonly storage: StorageProvider) {}

  async generateVideo(request: VideoGenerationRequest): Promise<GenerationResult> {
    return this.produce(request.directorSpec.action, request.directorSpec.durationSeconds, request.idempotencyKey);
  }

  async extendVideo(request: ExtendVideoRequest): Promise<GenerationResult> {
    return this.produce(`extended: ${request.directorSpec.action}`, request.additionalSeconds, request.idempotencyKey);
  }

  async imageToVideo(request: ImageToVideoRequest): Promise<GenerationResult> {
    return this.produce(`from image: ${request.directorSpec.action}`, request.directorSpec.durationSeconds, request.idempotencyKey);
  }

  private async produce(label: string, durationSeconds: number, idempotencyKey: string): Promise<GenerationResult> {
    const hasFfmpeg = await isFfmpegAvailable();
    if (hasFfmpeg) {
      try {
        const buffer = await generateTestClip(label, Math.max(1, Math.round(durationSeconds)));
        const key = `mock/videos/${idempotencyKey}.mp4`;
        const { url } = await this.storage.upload({ key, body: buffer, contentType: "video/mp4" });
        log.debug({ key }, "generated mock video via ffmpeg test clip");
        return {
          status: "READY",
          storageKey: key,
          url,
          durationSeconds,
          width: 1280,
          height: 720,
          mimeType: "video/mp4",
          costUsd: 0,
          metadata: { mock: true, method: "ffmpeg-testsrc", label },
        };
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : err }, "ffmpeg mock clip generation failed, falling back to placeholder metadata");
      }
    }

    const placeholder = Buffer.from(
      JSON.stringify({ mock: true, note: "ffmpeg not available in this environment; no playable video was generated.", label, durationSeconds }, null, 2),
    );
    const key = `mock/videos/${idempotencyKey}.mock.json`;
    const { url } = await this.storage.upload({ key, body: placeholder, contentType: "application/json" });
    return {
      status: "READY",
      storageKey: key,
      url,
      durationSeconds,
      mimeType: "application/x-mock-video-placeholder+json",
      costUsd: 0,
      metadata: { mock: true, method: "placeholder-json", label },
    };
  }
}
