import { describe, expect, it } from "vitest";
import { channelSpecSchema, EPISODE_PIPELINE_ORDER } from "../index.js";

const validSpec = {
  sourcePrompt: "A kids channel about space animals",
  identity: {
    channelNameOptions: ["Nova & Pip"],
    channelName: "Nova & Pip",
    tagline: "Big science, tiny explorers",
    language: "en",
    channelType: "kids-education",
    niche: "kids science",
  },
  audience: { targetAgeMin: 4, targetAgeMax: 7, targetAudienceDescription: "preschoolers" },
  positioning: { tone: "silly", valueProposition: "the funniest science show for preschoolers" },
  visualStyle: {
    visualStyleDescription: "bright flat illustration",
    thumbnailStyle: "big faces",
    colorDirection: "purple and orange",
    logoDirection: "bubble wordmark",
    avatarDirection: "circular frame",
    bannerDirection: "starry backyard",
  },
  voiceStyle: { voiceStyleDescription: "warm narrator", musicStyle: "ukulele synth" },
  contentStrategy: {
    episodeLengthTargetSeconds: 480,
    shortLengthTargetSeconds: 45,
    episodesPerWeek: 3,
    shortsPerWeek: 5,
    contentPillars: ["Space Basics"],
  },
  publishingStrategy: { publishingCadenceDescription: "3x/week" },
  contentPillars: ["Space Basics"],
  productionRules: {},
};

describe("channelSpecSchema", () => {
  it("parses a valid ChannelSpec and applies defaults", () => {
    const result = channelSpecSchema.parse(validSpec);
    expect(result.identity.channelName).toBe("Nova & Pip");
    expect(result.specVersion).toBe(1);
    expect(result.characters).toEqual([]);
    expect(result.productionRules.contentRating).toBe("GENERAL");
  });

  it("rejects a spec missing required fields", () => {
    const { identity, ...rest } = validSpec;
    expect(() => channelSpecSchema.parse(rest)).toThrow();
  });

  it("rejects an audience with an out-of-range age", () => {
    expect(() =>
      channelSpecSchema.parse({ ...validSpec, audience: { ...validSpec.audience, targetAgeMin: -1 } }),
    ).toThrow();
  });
});

describe("EPISODE_PIPELINE_ORDER", () => {
  it("starts at IDEA and ends at READY", () => {
    expect(EPISODE_PIPELINE_ORDER[0]).toBe("IDEA");
    expect(EPISODE_PIPELINE_ORDER[EPISODE_PIPELINE_ORDER.length - 1]).toBe("READY");
  });

  it("contains each stage exactly once", () => {
    expect(new Set(EPISODE_PIPELINE_ORDER).size).toBe(EPISODE_PIPELINE_ORDER.length);
  });
});
