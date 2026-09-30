import { contentPlanDraftSchema, type ChannelSpec, type ContentPlanDraft } from "@channelbase/shared";
import type { LLMProvider } from "@channelbase/providers";

const SYSTEM_PROMPT = `You are the Content Plan Engine. Given a ChannelSpec, produce a concrete content calendar for
the requested period covering both long-form videos and Shorts at the channel's stated cadence.
Every item needs a real, specific titleIdea and hook — not a generic placeholder — that a viewer
scrolling YouTube would actually click. Distribute items evenly across contentPillars and spread
targetPublishDate across the period.`;

export class ContentPlanEngine {
  constructor(private readonly llm: LLMProvider) {}

  async generate(spec: ChannelSpec, periodStart: Date, periodEnd: Date): Promise<ContentPlanDraft> {
    const days = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000));
    const weeks = Math.max(1, Math.round(days / 7));
    const longVideoCount = spec.contentStrategy.episodesPerWeek * weeks;
    const shortCount = spec.contentStrategy.shortsPerWeek * weeks;

    const prompt = `Channel: ${spec.identity.channelName} — ${spec.identity.tagline}
Content pillars: ${spec.contentPillars.join(", ")}
Series ideas: ${spec.contentStrategy.seriesIdeas.join(", ") || "none yet — invent 1-2"}
Period: ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)} (${days} days)
Target: ${longVideoCount} LONG_VIDEO items (~${spec.contentStrategy.episodeLengthTargetSeconds}s each) and
${shortCount} SHORT items (~${spec.contentStrategy.shortLengthTargetSeconds}s each), spread across the period
on these days when possible: ${spec.publishingStrategy.bestPublishingDays.join(", ") || "any"}.

Generate exactly ${longVideoCount + shortCount} items total (periodStart/periodEnd should match the period above).`;

    const draft = await this.llm.generateStructured({
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      schema: contentPlanDraftSchema,
      maxTokens: 4096,
    });
    return contentPlanDraftSchema.parse(draft);
  }
}
