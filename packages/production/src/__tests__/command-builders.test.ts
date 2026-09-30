import { describe, expect, it } from "vitest";
import { buildAudioMixCommand, buildConcatCommand, buildExportCommand, buildShortsCropCommand, buildTrimCommand } from "../command-builders.js";

describe("buildConcatCommand", () => {
  it("adds one -i flag per input and maps concatenated video+audio streams", () => {
    const args = buildConcatCommand(["a.mp4", "b.mp4", "c.mp4"], "out.mp4");
    expect(args.filter((a) => a === "-i")).toHaveLength(3);
    expect(args).toContain("out.mp4");
    expect(args.join(" ")).toContain("concat=n=3:v=1:a=1");
  });
});

describe("buildShortsCropCommand", () => {
  it("targets a 9:16 vertical frame by default", () => {
    const args = buildShortsCropCommand("in.mp4", "out.mp4");
    expect(args.join(" ")).toContain("scale=1080:-2,crop=1080:1920");
  });
});

describe("buildTrimCommand", () => {
  it("passes start/end as -ss/-to before the input", () => {
    const args = buildTrimCommand("in.mp4", "out.mp4", 5, 12);
    expect(args).toEqual(["-ss", "5", "-to", "12", "-i", "in.mp4", "-c", "copy", "out.mp4"]);
  });
});

describe("buildAudioMixCommand", () => {
  it("always caps output to the video's length with -shortest, regardless of audio track lengths", () => {
    const args = buildAudioMixCommand({ videoPath: "v.mp4", musicPath: "m.wav", outputPath: "out.mp4" });
    expect(args).toContain("-shortest");
  });

  it("uses a single-source anull passthrough (not amix) when only music is present", () => {
    // Regression test: this used to hardcode `amix=inputs=2` even with only one real
    // audio source connected, which is an invalid ffmpeg filtergraph.
    const args = buildAudioMixCommand({ videoPath: "v.mp4", musicPath: "m.wav", outputPath: "out.mp4" });
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).not.toContain("amix");
    expect(filter).toContain("anull");
  });

  it("uses amix with exactly 2 inputs when both narration and music are present", () => {
    const args = buildAudioMixCommand({ videoPath: "v.mp4", narrationPath: "n.wav", musicPath: "m.wav", outputPath: "out.mp4" });
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("amix=inputs=2");
  });

  it("copies the video stream untouched when there is no narration or music", () => {
    const args = buildAudioMixCommand({ videoPath: "v.mp4", outputPath: "out.mp4" });
    expect(args).toEqual(["-i", "v.mp4", "-c", "copy", "out.mp4"]);
  });
});

describe("buildExportCommand", () => {
  it("normalizes to h264/aac with faststart for web playback", () => {
    const args = buildExportCommand("in.mp4", "out.mp4");
    expect(args).toContain("libx264");
    expect(args).toContain("+faststart");
  });
});
