import { metadataSpecSchema, type ChannelSpec, type EpisodeScript, type MetadataSpec } from "@channelbase/shared";
import type { LLMProvider } from "@channelbase/providers";

const SYSTEM_PROMPT = `You are the Metadata Engine. Given an episode script, produce YouTube-ready metadata: 3-5
title candidates (pick the strongest as recommendedTitle), a description that hooks in the first
two lines and includes a natural summary (no keyword stuffing), relevant keywords, hashtags
(3-6, no more), and rough chapter markers derived from the scene structure. Titles and
descriptions must accurately represent the content — never write misleading or bait titles.`;

export class MetadataEngine {
  constructor(private readonly llm: LLMProvider) {}

  async generate(params: { spec: ChannelSpec; script: EpisodeScript }): Promise<MetadataSpec> {
    const { spec, script } = params;
    const chapterHints = script.scenes.reduce<{ label: string; t: number }[]>((acc, scene, i) => {
      const prev = acc[i - 1];
      const t = i === 0 ? 0 : (prev?.t ?? 0) + (script.scenes[i - 1]?.durationEstimateSeconds ?? 0);
      acc.push({ label: scene.purpose, t });
      return acc;
    }, []);

    const prompt = `Channel: ${spec.identity.channelName} (${spec.identity.niche})
Episode title: ${script.title}
Hook: ${script.hook}
Summary: ${script.summary}
Scene structure (for chapters): ${chapterHints.map((c) => `${c.t}s - ${c.label}`).join("; ")}
Content pillars: ${spec.contentPillars.join(", ")}

Produce complete YouTube metadata.`;

    const spec2 = await this.llm.generateStructured({ systemPrompt: SYSTEM_PROMPT, prompt, schema: metadataSpecSchema, maxTokens: 1536 });
    return metadataSpecSchema.parse(spec2);
  }
}
