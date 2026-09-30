import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createLogger } from "@channelbase/logger";
import type { GenerationResult } from "@channelbase/shared";
import type { GenerateSpeechRequest, StorageProvider, VoiceProfile, VoiceProvider } from "../interfaces.js";

const log = createLogger("provider:voice:elevenlabs");

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

/** ~2.5 words/sec at moderate narration pace — same heuristic MockVoiceProvider uses, kept here because ElevenLabs' convert() doesn't return timing metadata. */
const WORDS_PER_SECOND = 2.5;

/**
 * Real TTS adapter using ElevenLabs.
 *
 * Verified 2026-09-02 against the official @elevenlabs/elevenlabs-js SDK
 * source and README rather than guessed: `textToSpeech.convert(voiceId, {
 * text, modelId })` returns a `ReadableStream<Uint8Array>` of audio (mp3 by
 * default), and `voices.search()` lists available voices. Note: the older
 * `elevenlabs` npm package is deprecated in favor of this scoped one.
 */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly name = "elevenlabs";
  readonly isMock = false;
  private readonly client: ElevenLabsClient;

  constructor(
    apiKey: string,
    private readonly storage: StorageProvider,
    private readonly modelId = "eleven_multilingual_v2",
  ) {
    if (!apiKey) throw new Error("ElevenLabsVoiceProvider requires an API key. Set VOICE_API_KEY.");
    this.client = new ElevenLabsClient({ apiKey });
  }

  async generateSpeech(request: GenerateSpeechRequest): Promise<GenerationResult> {
    const stream = await this.client.textToSpeech.convert(request.voiceId, { text: request.text, modelId: this.modelId });
    const buffer = await streamToBuffer(stream);
    const key = `elevenlabs/voice/${request.idempotencyKey}.mp3`;
    const { url } = await this.storage.upload({ key, body: buffer, contentType: "audio/mpeg" });

    const wordCount = request.text.trim().split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.max(1, Math.round(wordCount / WORDS_PER_SECOND));

    log.info({ key, durationSeconds }, "generated speech via ElevenLabs");
    return {
      status: "READY",
      storageKey: key,
      url,
      durationSeconds,
      mimeType: "audio/mpeg",
      costUsd: 0,
      metadata: { voiceId: request.voiceId, model: this.modelId, text: request.text },
    };
  }

  async listVoices(): Promise<VoiceProfile[]> {
    const result = await this.client.voices.search({});
    return (result.voices ?? []).map((voice) => ({
      voiceId: voice.voiceId,
      name: voice.name ?? voice.voiceId,
      description: voice.labels?.description,
      gender: voice.labels?.gender,
      ageRange: voice.labels?.age,
      sampleUrl: voice.previewUrl ?? undefined,
    }));
  }
}
