import type { LLMProvider } from "@channelbase/providers";

export interface AnalyticsDigestInput {
  channelId: string;
  episodes: Array<{
    title: string;
    contentPillar: string;
    characterNames: string[];
    durationSeconds: number;
    publishHour: number;
    views: number;
    retention: number | null;
    thumbnailHeadline: string | null;
  }>;
}

export interface ChannelInsightsDraft {
  highPerformingCharacters: string[];
  highPerformingTopics: string[];
  strongHooks: string[];
  weakHooks: string[];
  bestDuration: { minSeconds: number; maxSeconds: number } | null;
  bestPublishingTimes: string[];
  thumbnailPatterns: string[];
  retentionPatterns: string[];
}

const EMPTY_INSIGHTS: ChannelInsightsDraft = {
  highPerformingCharacters: [],
  highPerformingTopics: [],
  strongHooks: [],
  weakHooks: [],
  bestDuration: null,
  bestPublishingTimes: [],
  thumbnailPatterns: [],
  retentionPatterns: [],
};

const MIN_EPISODES_FOR_INSIGHTS = 10;

/**
 * Placeholder for the future autonomous learning loop described in the
 * product spec: Analytics -> Insights -> Strategy revision -> next
 * ContentPlan. Intentionally NOT wired into any autonomous decision-making
 * in V1 — it only produces a read-only ChannelInsight record an admin/creator
 * can review. Call `generateInsights` once a channel has published enough
 * content for the analysis to be meaningful (see MIN_EPISODES_FOR_INSIGHTS).
 */
export class PerformanceLearningEngine {
  constructor(private readonly llm: LLMProvider) {}

  async generateInsights(input: AnalyticsDigestInput): Promise<ChannelInsightsDraft> {
    if (input.episodes.length < MIN_EPISODES_FOR_INSIGHTS) {
      return EMPTY_INSIGHTS;
    }

    const ranked = [...input.episodes].sort((a, b) => b.views - a.views);
    const top = ranked.slice(0, Math.ceil(ranked.length * 0.2));
    const bottom = ranked.slice(-Math.ceil(ranked.length * 0.2));

    const summary = await this.llm.analyze({
      prompt:
        "Given these top and bottom performing episodes (by views), summarize in a few short bullet " +
        "points: which characters/topics/hooks correlate with strong performance vs weak performance, " +
        "and what publish-time pattern the top performers share. Be concrete, not generic.",
      data: { top, bottom },
      maxTokens: 800,
    });

    return {
      ...EMPTY_INSIGHTS,
      highPerformingTopics: [...new Set(top.map((e) => e.contentPillar))],
      highPerformingCharacters: [...new Set(top.flatMap((e) => e.characterNames))],
      bestPublishingTimes: [...new Set(top.map((e) => `${e.publishHour}:00`))],
      retentionPatterns: [summary],
    };
  }
}

export { MIN_EPISODES_FOR_INSIGHTS };
