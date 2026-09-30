import { brandBibleSchema, type BrandBible, type ChannelSpec } from "@channelbase/shared";
import type { LLMProvider } from "@channelbase/providers";

const SYSTEM_PROMPT = `You are the Brand Engine of an autonomous channel builder. Given a ChannelSpec, produce a
complete BrandBible: a cohesive visual and verbal identity a professional brand designer would sign
off on. Prompts you write for logo/avatar/banner/thumbnails must be specific enough for an image
generation model to produce consistent, on-brand results — describe style, palette, composition,
mood and subject explicitly. Never mention that these are "AI prompts" — write them as creative
direction briefs.`;

export class BrandEngine {
  constructor(private readonly llm: LLMProvider) {}

  async generate(spec: ChannelSpec): Promise<BrandBible> {
    const prompt = `Channel: ${spec.identity.channelName} — ${spec.identity.tagline}
Niche: ${spec.identity.niche} (${spec.identity.channelType})
Audience: ages ${spec.audience.targetAgeMin}-${spec.audience.targetAgeMax}, ${spec.audience.targetAudienceDescription}
Tone: ${spec.positioning.tone}. Personality: ${spec.positioning.personality.join(", ")}
Visual direction from ChannelSpec: ${spec.visualStyle.visualStyleDescription}
Color direction: ${spec.visualStyle.colorDirection}
Logo direction: ${spec.visualStyle.logoDirection}
Avatar direction: ${spec.visualStyle.avatarDirection}
Banner direction: ${spec.visualStyle.bannerDirection}
Thumbnail style: ${spec.visualStyle.thumbnailStyle}

Produce a full BrandBible: brand name (usually the channel name), tagline, brand personality traits,
concrete logoPrompt/avatarPrompt/bannerPrompt creative briefs, a thumbnail system description, and a
BrandStyle object with primary/secondary colors as hex codes, typography direction, logoStyle,
illustrationStyle, lighting, backgroundStyle, and explicit compositionRules/thumbnailRules lists.
Also include brandRules (things to always do) and doNotUseRules (things to never do, e.g. clashing
colors, off-brand elements, unsafe imagery for the target age group).`;

    return this.llm
      .generateStructured({ systemPrompt: SYSTEM_PROMPT, prompt, schema: brandBibleSchema, maxTokens: 3072 })
      .then((data) => brandBibleSchema.parse(data));
  }
}
