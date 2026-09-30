import { describe, expect, it } from "vitest";
import { toSrtTimestamp } from "../assemble-video.js";

describe("toSrtTimestamp", () => {
  it("formats whole seconds as HH:MM:SS,mmm", () => {
    expect(toSrtTimestamp(0)).toBe("00:00:00,000");
    expect(toSrtTimestamp(65)).toBe("00:01:05,000");
    expect(toSrtTimestamp(3661)).toBe("01:01:01,000");
  });

  it("formats fractional seconds into milliseconds", () => {
    expect(toSrtTimestamp(1.5)).toBe("00:00:01,500");
  });
});
