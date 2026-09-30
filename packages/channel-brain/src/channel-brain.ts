import { channelSpecSchema, type ChannelSpec } from "@channelbase/shared";
import type { LLMProvider } from "@channelbase/providers";
import { createLogger } from "@channelbase/logger";

const log = createLogger("channel-brain");

const SYSTEM_PROMPT = `You are the Channel Brain of an autonomous YouTube channel builder. Your ONLY job is to
convert one natural-language description of a content channel into a complete, structured
ChannelSpec. You never talk to the end user directly and you never mention AI models, prompts,
or technical infrastructure in any field — all of your output is channel strategy, brand,
audience and content planning language a non-technical creator would recognize as a real
channel plan.

Be specific and concrete. Prefer decisive, production-ready choices over vague ones. Infer
sensible defaults for anything the user didn't specify, but never contradict what they did
specify. If the request implies characters (e.g. "two funny animals"), populate the characters
array. If it's a channel format that doesn't need recurring characters (e.g. a pure explainer
channel), you may leave characters empty and set productionRules.requiresCharacters to false.`;

/**
 * The Channel Brain: single entry point that turns a user's one-sentence
 * channel idea into a validated ChannelSpec. Every other engine in this
 * package reads from the resulting ChannelSpec — none of them re-read the
 * raw prompt.
 */
export class ChannelBrain {
  constructor(private readonly llm: LLMProvider) {}

  async generateChannelSpec(sourcePrompt: string): Promise<ChannelSpec> {
    log.info({ promptPreview: sourcePrompt.slice(0, 160) }, "generating ChannelSpec");

    const prompt = `Build a complete ChannelSpec for this channel idea:\n\n"""${sourcePrompt}"""\n\n` +
      `Generate 3-5 channel name options, pick the strongest as channelName. Write a tagline under 12 words.
Fill in a realistic, age-appropriate audience definition, a clear positioning/value proposition, a
cohesive visual style direction (colors, logo/avatar/banner direction, thumbnail style), a voice/music
style, a content strategy with concrete content pillars and a publishing cadence appropriate to the
request, and safety/production rules appropriate to the target audience (e.g. strict rules for
young children). Set contentStrategy.episodesPerWeek and shortsPerWeek to match what the user asked
for if they specified frequency; otherwise choose a sustainable default (2-3 long videos/week, 3-5
shorts/week).`;

    const spec = await this.llm.generateStructured({
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      schema: channelSpecSchema.omit({ sourcePrompt: true, specVersion: true }),
      maxTokens: 4096,
    });

    return channelSpecSchema.parse({ ...spec, sourcePrompt, specVersion: 1 });
  }
}
