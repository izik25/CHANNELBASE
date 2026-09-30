import { prisma } from "@channelbase/database";
import { CostCalculator, creditsForCostUsd, estimateCostUsd, type UsageEstimateInput } from "./cost-calculator.js";
import { CreditService } from "./credit-service.js";

export interface RecordUsageParams extends UsageEstimateInput {
  userId: string;
  channelId?: string;
  episodeId?: string;
  provider: string;
  providerModel?: string;
  /** If the provider reported an exact cost (e.g. a real API's billed amount), pass it to skip estimation. */
  actualCostUsd?: number;
}

/**
 * Records one UsageEvent per provider call and charges the corresponding
 * credits from the user's wallet. Called by the worker immediately after
 * every ProviderRouter call succeeds (mock providers report $0 cost, so this
 * still runs — it's what makes the cost dashboard show real activity even
 * fully offline).
 */
export class UsageRecorder {
  private readonly creditService = new CreditService();
  readonly costCalculator = new CostCalculator();

  async record(params: RecordUsageParams): Promise<{ costUsd: number; creditsCharged: number }> {
    const costUsd = params.actualCostUsd ?? estimateCostUsd(params);
    const creditsCharged = creditsForCostUsd(costUsd);

    await prisma.usageEvent.create({
      data: {
        userId: params.userId,
        channelId: params.channelId,
        episodeId: params.episodeId,
        provider: params.provider,
        providerModel: params.providerModel,
        operation: params.operation,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        generatedImages: params.generatedImages,
        generatedVideoSeconds: params.generatedVideoSeconds,
        generatedAudioSeconds: params.generatedAudioSeconds,
        estimatedProviderCostUsd: costUsd,
        creditsCharged,
      },
    });

    if (creditsCharged > 0) {
      await this.creditService.applyTransaction({
        userId: params.userId,
        type: "GENERATION",
        amount: creditsCharged,
        description: `${params.operation} via ${params.provider}`,
        referenceId: params.episodeId ?? params.channelId,
        allowNegativeBalance: true, // never block generation on credit exhaustion in V1; surfaced in UI instead
      });
    }

    return { costUsd, creditsCharged };
  }
}
