import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger } from "@channelbase/logger";
import type { GenerationResult } from "@channelbase/shared";
import type { StorageProvider } from "@channelbase/providers";
import { FFmpegService } from "./ffmpeg-service.js";
import {
  buildAudioMixCommand,
  buildConcatCommand,
  buildExportCommand,
  buildLogoOverlayCommand,
  buildShortsCropCommand,
  buildSubtitleMuxCommand,
} from "./command-builders.js";

const log = createLogger("media-composer");

export interface ComposableAsset {
  storageKey: string;
  mimeType: string;
  durationSeconds?: number;
}

export interface ComposeEpisodeParams {
  clips: ComposableAsset[];
  narration?: ComposableAsset;
  music?: ComposableAsset;
  subtitleSrt?: string;
  logo?: ComposableAsset;
  idempotencyKey: string;
}

export interface ComposeShortParams {
  sourceClip: ComposableAsset;
  startSeconds: number;
  endSeconds: number;
  idempotencyKey: string;
}

const REAL_VIDEO_MIME = "video/mp4";

/**
 * Assembles final episode/Short videos from already-generated clip/audio
 * assets. If ffmpeg isn't installed, or any input is a mock placeholder
 * (not a real playable video/audio file — see packages/providers video/voice
 * mocks), composition falls back to writing a JSON manifest describing what
 * WOULD have been composed, so the pipeline can still reach a READY
 * FINAL_VIDEO asset end-to-end in a fully offline dev environment.
 */
export class MediaComposer {
  private readonly ffmpeg = new FFmpegService();

  constructor(private readonly storage: StorageProvider) {}

  async composeEpisode(params: ComposeEpisodeParams): Promise<GenerationResult> {
    const canRunReal = (await this.ffmpeg.isAvailable()) && this.allAssetsReal(params);
    if (!canRunReal) return this.mockCompose(params);

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "channelbase-compose-"));
    try {
      const clipPaths = await Promise.all(params.clips.map((c, i) => this.downloadTo(c.storageKey, path.join(workDir, `clip-${i}.mp4`))));

      let current = path.join(workDir, "concat.mp4");
      await this.ffmpeg.run(buildConcatCommand(clipPaths, current));

      if (params.narration || params.music) {
        const narrationPath = params.narration ? await this.downloadTo(params.narration.storageKey, path.join(workDir, "narration.wav")) : undefined;
        const musicPath = params.music ? await this.downloadTo(params.music.storageKey, path.join(workDir, "music.wav")) : undefined;
        const mixed = path.join(workDir, "mixed.mp4");
        await this.ffmpeg.run(buildAudioMixCommand({ videoPath: current, narrationPath, musicPath, outputPath: mixed }));
        current = mixed;
      }

      if (params.subtitleSrt) {
        const srtPath = path.join(workDir, "subs.srt");
        await fs.writeFile(srtPath, params.subtitleSrt, "utf-8");
        const withSubs = path.join(workDir, "with-subs.mp4");
        await this.ffmpeg.run(buildSubtitleMuxCommand(current, srtPath, withSubs));
        current = withSubs;
      }

      if (params.logo) {
        const logoPath = await this.downloadTo(params.logo.storageKey, path.join(workDir, "logo.png"));
        const withLogo = path.join(workDir, "with-logo.mp4");
        await this.ffmpeg.run(buildLogoOverlayCommand(current, logoPath, withLogo));
        current = withLogo;
      }

      const finalPath = path.join(workDir, "final.mp4");
      await this.ffmpeg.run(buildExportCommand(current, finalPath));

      const buffer = await fs.readFile(finalPath);
      const key = `final/episodes/${params.idempotencyKey}.mp4`;
      const { url } = await this.storage.upload({ key, body: buffer, contentType: "video/mp4" });
      const durationSeconds = params.clips.reduce((sum, c) => sum + (c.durationSeconds ?? 0), 0);

      log.info({ key, durationSeconds }, "composed real final video via ffmpeg");
      return { status: "READY", storageKey: key, url, durationSeconds, mimeType: "video/mp4", costUsd: 0, metadata: { composed: true } };
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  async composeShort(params: ComposeShortParams): Promise<GenerationResult> {
    const canRunReal = (await this.ffmpeg.isAvailable()) && params.sourceClip.mimeType === REAL_VIDEO_MIME;
    if (!canRunReal) {
      return this.mockCompose({ clips: [params.sourceClip], idempotencyKey: params.idempotencyKey });
    }

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "channelbase-short-"));
    try {
      const sourcePath = await this.downloadTo(params.sourceClip.storageKey, path.join(workDir, "source.mp4"));
      const outPath = path.join(workDir, "short.mp4");
      await this.ffmpeg.run(buildShortsCropCommand(sourcePath, outPath));
      const buffer = await fs.readFile(outPath);
      const key = `final/shorts/${params.idempotencyKey}.mp4`;
      const { url } = await this.storage.upload({ key, body: buffer, contentType: "video/mp4" });
      return {
        status: "READY",
        storageKey: key,
        url,
        durationSeconds: params.endSeconds - params.startSeconds,
        width: 1080,
        height: 1920,
        mimeType: "video/mp4",
        costUsd: 0,
        metadata: { composed: true, short: true },
      };
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  private allAssetsReal(params: ComposeEpisodeParams): boolean {
    const assets = [...params.clips, params.narration, params.music, params.logo].filter((a): a is ComposableAsset => Boolean(a));
    return params.clips.every((c) => c.mimeType === REAL_VIDEO_MIME) && assets.every((a) => !a.mimeType.includes("mock") && !a.mimeType.includes("json"));
  }

  private async downloadTo(storageKey: string, localPath: string): Promise<string> {
    const buffer = await this.storage.get(storageKey);
    await fs.writeFile(localPath, buffer);
    return localPath;
  }

  private async mockCompose(params: ComposeEpisodeParams): Promise<GenerationResult> {
    const manifest = {
      mock: true,
      note: "ffmpeg unavailable or one or more inputs were mock placeholders — no real composition ran.",
      clips: params.clips.map((c) => c.storageKey),
      narration: params.narration?.storageKey,
      music: params.music?.storageKey,
      hasSubtitles: Boolean(params.subtitleSrt),
      logo: params.logo?.storageKey,
    };
    const key = `final/mock/${params.idempotencyKey}.mock.json`;
    const buffer = Buffer.from(JSON.stringify(manifest, null, 2));
    const { url } = await this.storage.upload({ key, body: buffer, contentType: "application/json" });
    const durationSeconds = params.clips.reduce((sum, c) => sum + (c.durationSeconds ?? 0), 0);
    log.info({ key }, "composed mock final video (manifest only)");
    return {
      status: "READY",
      storageKey: key,
      url,
      durationSeconds,
      mimeType: "application/x-mock-composition+json",
      costUsd: 0,
      metadata: manifest,
    };
  }
}
