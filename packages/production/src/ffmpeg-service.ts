import { spawn } from "node:child_process";
import { createLogger } from "@channelbase/logger";

const log = createLogger("ffmpeg-service");

let availability: boolean | undefined;

export interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Thin wrapper around the ffmpeg binary. Never construct command strings by
 * hand at a call site — build an argv array with a command builder (see
 * command-builders.ts) and pass it here. `isAvailable` is checked by
 * MediaComposer before doing any real work so the whole pipeline degrades
 * gracefully (see composer.ts) instead of throwing when ffmpeg isn't
 * installed in the current environment.
 */
export class FFmpegService {
  async isAvailable(): Promise<boolean> {
    if (availability !== undefined) return availability;
    availability = await new Promise<boolean>((resolve) => {
      const child = spawn("ffmpeg", ["-version"]);
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
    });
    return availability;
  }

  run(args: string[]): Promise<RunResult> {
    log.debug({ args }, "running ffmpeg");
    return new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", ["-y", ...args]);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += String(d)));
      child.stderr.on("data", (d) => (stderr += String(d)));
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
      });
    });
  }
}
