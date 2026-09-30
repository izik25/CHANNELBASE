import { describe, expect, it } from "vitest";
import { deriveWorkingTitle } from "../channel-service.js";

describe("deriveWorkingTitle", () => {
  it("truncates long prompts to a working title with an ellipsis", () => {
    const prompt = "A".repeat(100);
    const title = deriveWorkingTitle(prompt);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith("...")).toBe(true);
  });

  it("collapses internal whitespace", () => {
    expect(deriveWorkingTitle("A   channel   about   space")).toBe("A channel about space");
  });

  it("falls back to a default title for an empty prompt", () => {
    expect(deriveWorkingTitle("   ")).toBe("New Channel");
  });
});
