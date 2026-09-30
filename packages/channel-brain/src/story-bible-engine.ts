import { storyBibleSchema, type ChannelSpec, type CharacterDraft, type StoryBible, type WorldDraft } from "@channelbase/shared";
import type { LLMProvider } from "@channelbase/providers";

const SYSTEM_PROMPT = `You are the Story Bible Engine. Given a channel's spec, characters, and worlds, define the
narrative rules that keep every future episode consistent: core premise, themes, educational
objectives, character relationships, world rules, recurring elements, and things that must NEVER
happen in a story (forbiddenStoryElements) — especially anything unsafe or off-brand for the
target audience.`;

export class StoryBibleEngine {
  constructor(private readonly llm: LLMProvider) {}

  async generate(spec: ChannelSpec, characters: CharacterDraft[], worlds: WorldDraft[]): Promise<StoryBible> {
    const prompt = `Channel: ${spec.identity.channelName} — ${spec.positioning.valueProposition}
Audience: ages ${spec.audience.targetAgeMin}-${spec.audience.targetAgeMax}
Content pillars: ${spec.contentPillars.join(", ")}
Characters: ${characters.map((c) => `${c.name} (${c.role})`).join(", ") || "none"}
Worlds: ${worlds.map((w) => w.name).join(", ") || "none"}
Safety rules: ${spec.safetyRules.map((r) => r.rule).join("; ") || "none specified"}
Disallowed themes: ${spec.productionRules.disallowedThemes.join(", ") || "none specified"}

Produce a complete StoryBible.`;

    return this.llm
      .generateStructured({ systemPrompt: SYSTEM_PROMPT, prompt, schema: storyBibleSchema, maxTokens: 2048 })
      .then((data) => storyBibleSchema.parse(data));
  }
}
