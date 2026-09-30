import { createLogger } from "@channelbase/logger";
import type { GenerationResult } from "@channelbase/shared";
import type { GenerateSpeechRequest, StorageProvider, VoiceProfile, VoiceProvider } from "../interfaces.js";
import { generateSilentWav } from "../util/placeholders.js";

const log = createLogger("provider:voice:mock");

const MOCK_VOICES: VoiceProfile[] = [
  { voiceId: "mock-narrator-warm", name: "Warm Narrator", description: "Friendly, reassuring, mid-pitch", gender: "neutral", ageRange: "adult" },
  { voiceId: "mock-character-playful", name: "Playful Character", description: "Bright, energetic, upbeat", gender: "neutral", ageRange: "young" },
  { voiceId: "mock-narrator-calm", name: "Calm Narrator", description: "Soft, slow, soothing", gender: "neutral", ageRange: "adult" },
];

/** ~15 words per second at moderate pace, used only to size the placeholder WAV. */
const WORDS_PER_SECOND = 2.5;

export class MockVoiceProvider implements VoiceProvider {
  readonly name = "mock-voice";
  readonly isMock = true;

  constructor(private readonly storage: StorageProvider) {}

  async generateSpeech(request: GenerateSpeechRequest): Promise<GenerationResult> {
    const wordCount = request.text.trim().split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.max(1, Math.round(wordCount / WORDS_PER_SECOND));
    const wav = generateSilentWav(durationSeconds);
    const key = `mock/voice/${request.idempotencyKey}.wav`;
    const { url } = await this.storage.upload({ key, body: wav, contentType: "audio/wav" });
    log.debug({ key, durationSeconds }, "generated mock speech");
    return {
      status: "READY",
      storageKey: key,
      url,
      durationSeconds,
      mimeType: "audio/wav",
      costUsd: 0,
      metadata: { mock: true, voiceId: request.voiceId, text: request.text },
    };
  }

  async listVoices(): Promise<VoiceProfile[]> {
    return MOCK_VOICES;
  }
}
