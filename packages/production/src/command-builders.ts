/**
 * Pure functions that build ffmpeg argv arrays for one operation each.
 * Nothing here executes anything — FFmpegService.run() does. Keeping every
 * command in its own small builder means adding a new composition step
 * never means hand-editing a giant existing command string.
 */

export function buildConcatCommand(inputPaths: string[], outputPath: string): string[] {
  const inputArgs = inputPaths.flatMap((p) => ["-i", p]);
  const filterInputs = inputPaths.map((_, i) => `[${i}:v:0][${i}:a:0]`).join("");
  const filter = `${filterInputs}concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`;
  return [...inputArgs, "-filter_complex", filter, "-map", "[outv]", "-map", "[outa]", "-c:v", "libx264", "-c:a", "aac", outputPath];
}

export function buildAudioMixCommand(params: { videoPath: string; narrationPath?: string; musicPath?: string; outputPath: string; musicVolume?: number }): string[] {
  const { videoPath, narrationPath, musicPath, outputPath, musicVolume = 0.25 } = params;
  const inputs = ["-i", videoPath];
  let idx = 1;
  let narrationLabel: string | undefined;
  let musicLabel: string | undefined;
  const filterParts: string[] = [];

  if (narrationPath) {
    inputs.push("-i", narrationPath);
    narrationLabel = `${idx}:a`;
    idx += 1;
  }
  if (musicPath) {
    inputs.push("-i", musicPath);
    filterParts.push(`[${idx}:a]volume=${musicVolume}[music]`);
    musicLabel = "music";
    idx += 1;
  }

  if (!narrationLabel && !musicLabel) {
    return [...inputs, "-c", "copy", outputPath];
  }

  // Bug this replaced: previously always wrote `amix=inputs=2` even with only one real
  // audio source connected (e.g. music with no narration), which is an invalid
  // filtergraph — and separately, nothing capped output length to the video's own
  // duration, so a mismatched (e.g. too-long) music/narration track silently stretched
  // the whole "final video" well past its actual content. `-shortest` below is the fix
  // for the second half: the master timeline is always the concatenated video.
  const sources = [narrationLabel && `[${narrationLabel}]`, musicLabel && `[${musicLabel}]`].filter((s): s is string => Boolean(s));
  if (sources.length === 2) {
    filterParts.push(`${sources.join("")}amix=inputs=2:duration=longest[outa]`);
  } else {
    filterParts.push(`${sources[0]}anull[outa]`);
  }

  return [...inputs, "-filter_complex", filterParts.join(";"), "-map", "0:v", "-map", "[outa]", "-c:v", "copy", "-c:a", "aac", "-shortest", outputPath];
}

export function buildSubtitleMuxCommand(videoPath: string, srtPath: string, outputPath: string): string[] {
  return ["-i", videoPath, "-i", srtPath, "-map", "0", "-map", "1", "-c", "copy", "-c:s", "mov_text", outputPath];
}

export function buildResizeCommand(inputPath: string, outputPath: string, width: number, height: number): string[] {
  return ["-i", inputPath, "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`, outputPath];
}

/** Crops/pads a source clip to a 9:16 vertical frame for Shorts. */
export function buildShortsCropCommand(inputPath: string, outputPath: string, targetWidth = 1080, targetHeight = 1920): string[] {
  return [
    "-i",
    inputPath,
    "-vf",
    `scale=${targetWidth}:-2,crop=${targetWidth}:${targetHeight}`,
    "-c:a",
    "copy",
    outputPath,
  ];
}

export function buildLogoOverlayCommand(inputPath: string, logoPath: string, outputPath: string, position: "top-right" | "bottom-right" = "bottom-right"): string[] {
  const overlayPos = position === "top-right" ? "main_w-overlay_w-20:20" : "main_w-overlay_w-20:main_h-overlay_h-20";
  return ["-i", inputPath, "-i", logoPath, "-filter_complex", `overlay=${overlayPos}`, "-c:a", "copy", outputPath];
}

export function buildTrimCommand(inputPath: string, outputPath: string, startSeconds: number, endSeconds: number): string[] {
  return ["-ss", String(startSeconds), "-to", String(endSeconds), "-i", inputPath, "-c", "copy", outputPath];
}

export function buildExportCommand(inputPath: string, outputPath: string): string[] {
  return ["-i", inputPath, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath];
}
