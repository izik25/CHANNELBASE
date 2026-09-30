import { prisma } from "@channelbase/database";

/**
 * Per-unit cost estimates used when a provider doesn't report exact cost
 * (mocks always cost $0). These are deliberately simple, documented
 * placeholders — replace with your actual provider pricing once real
 * providers are activated. Credits are charged at a flat markup over the
 * estimated provider cost (see CREDIT_MARKUP_MULTIPLIER).
 */
export const COST_ESTIMATES_USD = {
  llmPer1kInputTokens: 0.003,
  llmPer1kOutputTokens: 0.015,
  imagePerGeneration: 0.04,
  videoPerSecond: 0.5,
  voicePerSecond: 0.02,
  musicPerSecond: 0.05,
};

export const CREDIT_MARKUP_MULTIPLIER = 100; // 1 USD of provider cost = 100 credits charged

export interface UsageEstimateInput {
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  generatedImages?: number;
  generatedVideoSeconds?: number;
  generatedAudioSeconds?: number;
}

export function estimateCostUsd(input: UsageEstimateInput): number {
  let cost = 0;
  if (input.inputTokens) cost += (input.inputTokens / 1000) * COST_ESTIMATES_USD.llmPer1kInputTokens;
  if (input.outputTokens) cost += (input.outputTokens / 1000) * COST_ESTIMATES_USD.llmPer1kOutputTokens;
  if (input.generatedImages) cost += input.generatedImages * COST_ESTIMATES_USD.imagePerGeneration;
  if (input.generatedVideoSeconds) cost += input.generatedVideoSeconds * COST_ESTIMATES_USD.videoPerSecond;
  if (input.generatedAudioSeconds) cost += input.generatedAudioSeconds * COST_ESTIMATES_USD.voicePerSecond;
  return Number(cost.toFixed(4));
}

export function creditsForCostUsd(costUsd: number): number {
  return Number((costUsd * CREDIT_MARKUP_MULTIPLIER).toFixed(4));
}

/**
 * Aggregates UsageEvent rows for cost dashboards (episode/channel/user/provider).
 * This is the only place that should run these aggregate queries — keep
 * dashboard cards and admin views calling through here instead of
 * duplicating groupBy queries.
 */
export class CostCalculator {
  async getEpisodeCost(episodeId: string): Promise<{ totalCostUsd: number; totalCredits: number; eventCount: number }> {
    const agg = await prisma.usageEvent.aggregate({
      where: { episodeId },
      _sum: { estimatedProviderCostUsd: true, creditsCharged: true },
      _count: true,
    });
    return {
      totalCostUsd: Number(agg._sum.estimatedProviderCostUsd ?? 0),
      totalCredits: Number(agg._sum.creditsCharged ?? 0),
      eventCount: agg._count,
    };
  }

  async getChannelCost(channelId: string): Promise<{ totalCostUsd: number; totalCredits: number; eventCount: number }> {
    const agg = await prisma.usageEvent.aggregate({
      where: { channelId },
      _sum: { estimatedProviderCostUsd: true, creditsCharged: true },
      _count: true,
    });
    return {
      totalCostUsd: Number(agg._sum.estimatedProviderCostUsd ?? 0),
      totalCredits: Number(agg._sum.creditsCharged ?? 0),
      eventCount: agg._count,
    };
  }

  async getUserMonthlyCost(userId: string, monthStart: Date = startOfMonth()): Promise<{ totalCostUsd: number; totalCredits: number; eventCount: number }> {
    const agg = await prisma.usageEvent.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { estimatedProviderCostUsd: true, creditsCharged: true },
      _count: true,
    });
    return {
      totalCostUsd: Number(agg._sum.estimatedProviderCostUsd ?? 0),
      totalCredits: Number(agg._sum.creditsCharged ?? 0),
      eventCount: agg._count,
    };
  }

  async getProviderCostBreakdown(userId: string): Promise<Array<{ provider: string; totalCostUsd: number; eventCount: number }>> {
    const rows = await prisma.usageEvent.groupBy({
      by: ["provider"],
      where: { userId },
      _sum: { estimatedProviderCostUsd: true },
      _count: true,
    });
    return rows.map((r) => ({ provider: r.provider, totalCostUsd: Number(r._sum.estimatedProviderCostUsd ?? 0), eventCount: r._count }));
  }
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
