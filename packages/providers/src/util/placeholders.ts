import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

/**
 * Generates a small, inspectable SVG placeholder for image-type mock assets.
 * Uses only plain SVG `<text>` (no `<foreignObject>` HTML) because this gets
 * rasterized to PNG via sharp/librsvg for ffmpeg compatibility (see
 * rasterizeSvgToPng below), and librsvg doesn't render foreignObject content.
 */
export function generateSvgPlaceholder(label: string, width = 1024, height = 1024): Buffer {
  const escaped = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fontSize = Math.round(width / 42);
  const lineHeight = fontSize * 1.4;
  const lines = wrapText(escaped, Math.round(width / (fontSize * 0.55)), 6);
  const textStartY = height * 0.55;
  const tspans = lines.map((line, i) => `<tspan x="50%" y="${textStartY + i * lineHeight}">${line}</tspan>`).join("\n    ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="46%" font-family="sans-serif" font-size="${Math.round(width / 24)}" fill="white" text-anchor="middle" opacity="0.9">MOCK ASSET</text>
  <text font-family="sans-serif" font-size="${fontSize}" fill="white" text-anchor="middle" opacity="0.85">
    ${tspans}
  </text>
</svg>`;
  return Buffer.from(svg, "utf-8");
}

/**
 * Rasterizes SVG markup to a real PNG. Mock image assets are generated as SVG
 * (easy to build, easy to inspect) but rasterized before upload: browsers
 * happily render SVG directly, but ffmpeg (used to composite a channel's
 * logo onto video during assembly, see packages/production) has no SVG
 * decoder in most builds and fails outright, so anything that might end up
 * in an ffmpeg filtergraph needs to be a real raster image.
 */
export async function rasterizeSvgToPng(svg: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(svg, { density: 144 }).resize(width, height).png().toBuffer();
}

/** Generates a valid, silent PCM WAV file of the given duration — used for mock voice/music/sfx assets. */
export function generateSilentWav(durationSeconds: number, sampleRate = 22050): Buffer {
  const numSamples = Math.max(1, Math.round(durationSeconds * sampleRate));
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  // remaining bytes are already zeroed (silence)
  return buffer;
}

let ffmpegAvailable: boolean | undefined;

export async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailable !== undefined) return ffmpegAvailable;
  ffmpegAvailable = await new Promise<boolean>((resolve) => {
    const child = spawn("ffmpeg", ["-version"]);
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
  return ffmpegAvailable;
}

/**
 * Generates a short test video using ffmpeg's `lavfi` test sources. Used only
 * by MockVideoProvider when ffmpeg is installed locally; otherwise the mock
 * falls back to a JSON placeholder.
 *
 * Deliberately does NOT use the `drawtext` filter to burn in the scene label:
 * `drawtext` depends on fontconfig, and on a fair number of Windows ffmpeg
 * builds fontconfig can't locate its config file — which doesn't error
 * gracefully, it crashes the whole ffmpeg process (exit code 0xC0000005,
 * access violation), silently losing the label AND the video. `testsrc`
 * has its own built-in animated pattern (moving color bars, a spinning
 * clock hand) rendered without fontconfig, so it works everywhere ffmpeg's
 * lavfi input support does.
 */
export async function generateTestClip(_label: string, durationSeconds: number): Promise<Buffer> {
  const tmpFile = path.join(os.tmpdir(), `channelbase-mock-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=1280x720:rate=25:duration=${durationSeconds}`,
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=22050:cl=mono:duration=${durationSeconds}`,
    "-shortest",
    "-t",
    String(durationSeconds),
    "-pix_fmt",
    "yuv420p",
    tmpFile,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
  });

  const buffer = await fs.readFile(tmpFile);
  await fs.rm(tmpFile, { force: true });
  return buffer;
}
