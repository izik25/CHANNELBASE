import OpenAI from "openai";
import { createLogger } from "@channelbase/logger";
import type { GenerationResult } from "@channelbase/shared";
import type { ImageGenerationRequest, ImageProvider, ReferenceSheetRequest, StorageProvider } from "../interfaces.js";

const log = createLogger("provider:image:openai");

const REFERENCE_FRAMING: Record<string, string> = {
  FRONT: "front view, facing camera directly",
  SIDE: "side profile view",
  FULL_BODY: "full body, standing pose, head to toe visible",
  EXPRESSION_SHEET: "expression sheet showing happy, surprised, sad, and angry expressions in a grid",
  POSE: "dynamic action pose",
};

type SupportedSize = "1024x1024" | "1024x1536" | "1536x1024";

/**
 * Real image adapter using OpenAI's gpt-image-1 model.
 *
 * Verified 2026-09-02 against the official openai-python SDK source
 * (openai/openai-python: types/image.py, types/image_model.py,
 * resources/images.py) rather than guessed: gpt-image-1 always returns
 * base64 image data (the `url`/`response_format` option only applies to
 * dall-e-2/dall-e-3), and its supported sizes are 1024x1024, 1024x1536,
 * 1536x1024, or "auto".
 */
export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";
  readonly isMock = false;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly storage: StorageProvider,
    private readonly model = "gpt-image-1",
  ) {
    if (!apiKey) throw new Error("OpenAIImageProvider requires an API key. Set IMAGE_API_KEY.");
    this.client = new OpenAI({ apiKey });
  }

  private nearestSupportedSize(width?: number, height?: number): SupportedSize {
    if (!width || !height || width === height) return "1024x1024";
    return width > height ? "1536x1024" : "1024x1536";
  }

  async generateImage(request: ImageGenerationRequest): Promise<GenerationResult> {
    const size = this.nearestSupportedSize(request.width, request.height);
    const prompt = [request.prompt, request.negativePrompt ? `Avoid: ${request.negativePrompt}` : ""].filter(Boolean).join("\n");

    const response = await this.client.images.generate({ model: this.model, prompt, size, n: 1 });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI image generation returned no image data.");

    const buffer = Buffer.from(b64, "base64");
    const key = `openai/images/${request.idempotencyKey}.png`;
    const { url } = await this.storage.upload({ key, body: buffer, contentType: "image/png" });
    const [width, height] = size.split("x").map(Number);

    log.info({ key, size }, "generated image via OpenAI");
    return { status: "READY", storageKey: key, url, width, height, mimeType: "image/png", costUsd: 0, metadata: { model: this.model, prompt: request.prompt } };
  }

  async generateReferenceSheet(request: ReferenceSheetRequest): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];
    for (const kind of request.kinds) {
      const framing = REFERENCE_FRAMING[kind] ?? kind;
      const prompt = [
        request.characterVisualPrompt,
        `${framing}, plain neutral background, consistent character design reference sheet.`,
        request.negativePrompt ? `Avoid: ${request.negativePrompt}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const response = await this.client.images.generate({ model: this.model, prompt, size: "1024x1024", n: 1 });
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) {
        log.warn({ kind }, "OpenAI returned no image data for this reference kind, skipping");
        continue;
      }

      const buffer = Buffer.from(b64, "base64");
      const key = `openai/character-refs/${request.idempotencyKey}-${kind.toLowerCase()}.png`;
      const { url } = await this.storage.upload({ key, body: buffer, contentType: "image/png" });
      results.push({ status: "READY", storageKey: key, url, width: 1024, height: 1024, mimeType: "image/png", costUsd: 0, metadata: { model: this.model, kind } });
    }
    return results;
  }
}
