import { shortSpecSchema, type EpisodeScript, type ShortSpec } from "@channelbase/shared";
import type { LLMProvider } from "@channelbase/providers";

const SYSTEM_PROMPT = `You are the Shorts Engine. Given a long-form episode script, identify the single most
compelling self-contained moment (or write a new hook if extracting one wouldn't work) and turn it
into a vertical 9:16 Short under 60 seconds with a strong first-2-second hook, bold caption
styling instructions, and a clear call to action.`;

export class ShortEngine {
  constructor(private readonly llm: LLMProvider) {}

  async generateFromEpisode(params: { script: EpisodeScript; sourceEpisodeId: string; targetDurationSeconds: number }): Promise<ShortSpec> {
    const prompt = `Source episode: "${params.script.title}"
Summary: ${params.script.summary}
Scenes: ${params.script.scenes.map((s, i) => `${i + 1}. [${s.durationEstimateSeconds}s] ${s.purpose}: ${s.action}`).join("\n")}
Target Short duration: ${params.targetDurationSeconds} seconds

Select selectedMoments (with approximate startSeconds/endSeconds within the source episode's
timeline) that make the strongest possible standalone Short, or describe a new self-contained hook
if nothing extracts cleanly.`;

    const spec = await this.llm.generateStructured({ systemPrompt: SYSTEM_PROMPT, prompt, schema: shortSpecSchema, maxTokens: 1536 });
    return shortSpecSchema.parse({ ...spec, sourceEpisodeId: params.sourceEpisodeId, durationSeconds: params.targetDurationSeconds });
  }
}
