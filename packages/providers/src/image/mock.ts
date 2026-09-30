import { createLogger } from "@channelbase/logger";
import type { GenerationResult } from "@channelbase/shared";
import type { ImageGenerationRequest, ImageProvider, ReferenceSheetRequest, StorageProvider } from "../interfaces.js";
import { generateSvgPlaceholder, rasterizeSvgToPng } from "../util/placeholders.js";

const log = createLogger("provider:image:mock");

export class MockImageProvider implements ImageProvider {
  readonly name = "mock-image";
  readonly isMock = true;

  constructor(private readonly storage: StorageProvider) {}

  async generateImage(request: ImageGenerationRequest): Promise<GenerationResult> {
    const width = request.width ?? 1024;
    const height = request.height ?? 1024;
    const svg = generateSvgPlaceholder(request.prompt, width, height);
    const png = await rasterizeSvgToPng(svg, width, height);
    const key = `mock/images/${request.idempotencyKey}.png`;
    const { url } = await this.storage.upload({ key, body: png, contentType: "image/png" });
    log.debug({ key }, "generated mock image");
    return {
      status: "READY",
      storageKey: key,
      url,
      width,
      height,
      mimeType: "image/png",
      costUsd: 0,
      metadata: { mock: true, prompt: request.prompt },
    };
  }

  async generateReferenceSheet(request: ReferenceSheetRequest): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];
    for (const kind of request.kinds) {
      const svg = generateSvgPlaceholder(`${kind}: ${request.characterVisualPrompt}`, 1024, 1024);
      const png = await rasterizeSvgToPng(svg, 1024, 1024);
      const key = `mock/character-refs/${request.idempotencyKey}-${kind.toLowerCase()}.png`;
      const { url } = await this.storage.upload({ key, body: png, contentType: "image/png" });
      results.push({
        status: "READY",
        storageKey: key,
        url,
        width: 1024,
        height: 1024,
        mimeType: "image/png",
        costUsd: 0,
        metadata: { mock: true, kind },
      });
    }
    return results;
  }
}
