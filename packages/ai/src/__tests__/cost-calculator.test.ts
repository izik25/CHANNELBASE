import { describe, expect, it } from "vitest";
import { COST_ESTIMATES_USD, CREDIT_MARKUP_MULTIPLIER, creditsForCostUsd, estimateCostUsd } from "../cost-calculator.js";

describe("estimateCostUsd", () => {
  it("returns 0 for an empty usage event", () => {
    expect(estimateCostUsd({ operation: "noop" })).toBe(0);
  });

  it("prices LLM token usage", () => {
    const cost = estimateCostUsd({ operation: "generateStructured", inputTokens: 1000, outputTokens: 1000 });
    expect(cost).toBeCloseTo(COST_ESTIMATES_USD.llmPer1kInputTokens + COST_ESTIMATES_USD.llmPer1kOutputTokens, 4);
  });

  it("prices image, video and audio generation independently", () => {
    const cost = estimateCostUsd({ operation: "mixed", generatedImages: 2, generatedVideoSeconds: 10, generatedAudioSeconds: 5 });
    const expected = 2 * COST_ESTIMATES_USD.imagePerGeneration + 10 * COST_ESTIMATES_USD.videoPerSecond + 5 * COST_ESTIMATES_USD.voicePerSecond;
    expect(cost).toBeCloseTo(expected, 4);
  });
});

describe("creditsForCostUsd", () => {
  it("applies the credit markup multiplier", () => {
    expect(creditsForCostUsd(1)).toBe(CREDIT_MARKUP_MULTIPLIER);
    expect(creditsForCostUsd(0)).toBe(0);
  });
});
