import { describe, expect, it } from "vitest";
import { MockLLMProvider } from "@channelbase/providers";
import { ChannelBrain } from "../channel-brain.js";
import { QualityEngine } from "../quality-engine.js";
import type { EpisodeScript } from "@channelbase/shared";

describe("ChannelBrain (with MockLLMProvider, no network)", () => {
  it("produces a valid ChannelSpec end-to-end from a single prompt", async () => {
    const brain = new ChannelBrain(new MockLLMProvider());
    const spec = await brain.generateChannelSpec(
      "Create an English YouTube channel for kids aged 4-7 about two funny animals exploring science and space.",
    );

    expect(spec.identity.channelName.length).toBeGreaterThan(0);
    expect(spec.audience.targetAgeMin).toBeLessThanOrEqual(spec.audience.targetAgeMax);
    expect(spec.contentStrategy.contentPillars.length).toBeGreaterThan(0);
    expect(spec.sourcePrompt).toContain("kids aged 4-7");
  });
});

describe("QualityEngine", () => {
  const script: EpisodeScript = {
    title: "Test Episode",
    hook: "A hook",
    summary: "A summary",
    intro: "An intro",
    beats: [],
    ending: "The end",
    cta: "Subscribe!",
    scenes: [
      {
        sceneNumber: 1,
        durationEstimateSeconds: 60,
        locationName: "Backyard",
        characterNames: ["Nova"],
        purpose: "intro",
        action: "Nova waves hello",
        dialogue: [],
        emotion: "happy",
        visualDescription: "Nova waving",
        transition: "cut",
      },
    ],
  };

  it("averages heuristic and subjective checks into an overall score, and flags missing assets as a risk", async () => {
    const engine = new QualityEngine(new MockLLMProvider());
    const result = await engine.review({
      script,
      priorEpisodeSummaries: [],
      targetDurationSeconds: 60,
      actualDurationSeconds: 60,
      missingAssetCount: 5,
      totalAssetCount: 5,
    });

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.checks).toHaveLength(9);
    expect(result.riskCategories).toContain("LOW_VALUE_AUTOMATION_RISK");
  });

  it("does not flag risk when duration matches and no assets are missing", async () => {
    const engine = new QualityEngine(new MockLLMProvider());
    const result = await engine.review({
      script,
      priorEpisodeSummaries: [],
      targetDurationSeconds: 60,
      actualDurationSeconds: 60,
      missingAssetCount: 0,
      totalAssetCount: 5,
    });

    expect(result.riskCategories).not.toContain("LOW_VALUE_AUTOMATION_RISK");
  });
});
