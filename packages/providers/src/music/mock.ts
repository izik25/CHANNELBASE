import { createLogger } from "@channelbase/logger";
import type { GenerationResult } from "@channelbase/shared";
import type { GenerateMusicRequest, MusicProvider, StorageProvider } from "../interfaces.js";
import { generateSilentWav } from "../util/placeholders.js";

const log = createLogger("provider:music:mock");

export class MockMusicProvider implements MusicProvider {
  readonly name = "mock-music";
  readonly isMock = true;

  constructor(private readonly storage: StorageProvider) {}

  async generateMusic(request: GenerateMusicRequest): Promise<GenerationResult> {
    const wav = generateSilentWav(request.durationSeconds);
    const key = `mock/music/${request.idempotencyKey}.wav`;
    const { url } = await this.storage.upload({ key, body: wav, contentType: "audio/wav" });
    log.debug({ key }, "generated mock music bed");
    return {
      status: "READY",
      storageKey: key,
      url,
      durationSeconds: request.durationSeconds,
      mimeType: "audio/wav",
      costUsd: 0,
      metadata: { mock: true, style: request.style, mood: request.moodDescription },
    };
  }
}
