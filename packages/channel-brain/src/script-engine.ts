import { episodeScriptSchema, type BrandBible, type ChannelSpec, type CharacterDraft, type ContentPlanItem, type EpisodeScript, type StoryBible, type WorldDraft } from "@channelbase/shared";
import type { LLMProvider } from "@channelbase/providers";

const SYSTEM_PROMPT = `You are the Script Engine. Write a complete, scene-by-scene episode script grounded in the
channel's brand, characters, world and story bible. Do not just write prose — break the episode
into discrete Scenes, each with a purpose, action, dialogue lines attributed to specific
characters, narration, emotion, a concrete visualDescription usable for image/video generation,
and a transition. Keep language, pacing and themes appropriate for the target audience age range
and consistent with all safety rules and forbidden story elements.`;

export class ScriptEngine {
  constructor(private readonly llm: LLMProvider) {}

  async generateScript(params: {
    spec: ChannelSpec;
    brand: BrandBible;
    storyBible: StoryBible;
    characters: CharacterDraft[];
    worlds: WorldDraft[];
    contentPlanItem: Pick<ContentPlanItem, "titleIdea" | "concept" | "hook" | "targetDurationSeconds" | "format">;
  }): Promise<EpisodeScript> {
    const { spec, storyBible, characters, worlds, contentPlanItem } = params;

    const prompt = `Channel: ${spec.identity.channelName}, tone: ${spec.positioning.tone}
Audience: ages ${spec.audience.targetAgeMin}-${spec.audience.targetAgeMax}
Story premise: ${storyBible.premise}
Characters available: ${characters.map((c) => `${c.name} (${c.role}, speaks: ${c.personality.speechStyle})`).join("; ") || "none — narration-driven"}
Worlds/locations available: ${worlds.flatMap((w) => w.locations.map((l) => l.name)).join(", ") || "none — describe settings freely"}
Forbidden story elements: ${storyBible.forbiddenStoryElements.join("; ") || "none specified"}

Episode brief:
Title idea: ${contentPlanItem.titleIdea}
Concept: ${contentPlanItem.concept}
Hook: ${contentPlanItem.hook}
Target duration: ${contentPlanItem.targetDurationSeconds} seconds
Format: ${contentPlanItem.format}

Write the full script with ${contentPlanItem.targetDurationSeconds > 180 ? "6-10" : "3-5"} scenes whose combined
durationEstimateSeconds roughly sums to the target duration. Only reference characterNames and
locationName values from the lists above (or "Narrator"/a generic setting if none are available).`;

    const script = await this.llm.generateStructured({ systemPrompt: SYSTEM_PROMPT, prompt, schema: episodeScriptSchema, maxTokens: 6144 });
    return episodeScriptSchema.parse(script);
  }
}
