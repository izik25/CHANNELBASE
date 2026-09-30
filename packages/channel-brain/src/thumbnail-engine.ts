import { thumbnailSpecSchema, type BrandBible, type ChannelSpec, type ThumbnailSpec } from "@channelbase/shared";
import type { LLMProvider } from "@channelbase/providers";

const SYSTEM_PROMPT = `You are the Thumbnail Engine. Design a high-click-through YouTube thumbnail concept for one
episode: a bold headline (max 5 words), the emotion on display, the exact scene/composition, and a
visual hook that stops scrolling — while staying strictly within the brand's thumbnailRules and
never keyword-stuffing or using misleading clickbait.`;

export class ThumbnailEngine {
  constructor(private readonly llm: LLMProvider) {}

  async generate(params: { spec: ChannelSpec; brand: BrandBible; episodeTitle: string; episodeSummary: string; characterNames: string[] }): Promise<ThumbnailSpec> {
    const prompt = `Channel: ${params.spec.identity.channelName}
Episode: "${params.episodeTitle}" — ${params.episodeSummary}
Available characters: ${params.characterNames.join(", ") || "none"}
Brand thumbnail rules: ${params.brand.style.thumbnailRules.join("; ") || "none"}
Brand do-not-use rules: ${params.brand.doNotUseRules.join("; ") || "none"}

Produce a complete ThumbnailSpec.`;

    const spec = await this.llm.generateStructured({ systemPrompt: SYSTEM_PROMPT, prompt, schema: thumbnailSpecSchema, maxTokens: 1024 });
    return thumbnailSpecSchema.parse(spec);
  }
}
