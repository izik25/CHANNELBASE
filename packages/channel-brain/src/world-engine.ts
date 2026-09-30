import { z } from "zod";
import { worldDraftSchema, type ChannelSpec, type BrandBible, type WorldDraft } from "@channelbase/shared";
import type { LLMProvider } from "@channelbase/providers";

const SYSTEM_PROMPT = `You are the World Engine of an autonomous channel builder, designing the recurring settings
(the "World Bible") a channel's episodes take place in. Each location needs enough concrete visual
detail (environment, architecture, lighting, palette, weather, important recurring objects) to stay
visually consistent across many future episodes generated independently by image/video models.`;

const responseSchema = z.object({ worlds: z.array(worldDraftSchema) });

export class WorldEngine {
  constructor(private readonly llm: LLMProvider) {}

  async generate(spec: ChannelSpec, brand: BrandBible): Promise<WorldDraft[]> {
    if (!spec.productionRules.requiresWorldBible && spec.worlds.length === 0) return [];

    const seeds = spec.worlds.length
      ? spec.worlds.map((w) => `- ${w.name}: ${w.shortDescription}`).join("\n")
      : "No specific worlds were requested — invent 1 primary world with 2-3 recurring locations that fit this channel's content pillars.";

    const prompt = `Channel: ${spec.identity.channelName}, niche: ${spec.identity.niche}
Content pillars: ${spec.contentPillars.join(", ")}
Visual style: ${brand.style.illustrationStyle}, colors: ${brand.style.primaryColors.join(", ")}
World seeds:
${seeds}

For each world, produce a name, description, world rules, and 2-4 fully detailed Locations
(environmentDescription, lighting, colorPalette, importantObjects, visualPrompt, negativePrompt).`;

    const { worlds } = await this.llm.generateStructured({ systemPrompt: SYSTEM_PROMPT, prompt, schema: responseSchema, maxTokens: 4096 });
    return worlds;
  }
}
