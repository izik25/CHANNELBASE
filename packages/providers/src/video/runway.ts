import { createLogger } from "@channelbase/logger";
import type { GenerationResult } from "@channelbase/shared";
import { ProviderNotConfiguredError, ProviderRequestError } from "../errors.js";
import type { ExtendVideoRequest, ImageToVideoRequest, StorageProvider, VideoGenerationRequest, VideoProvider } from "../interfaces.js";

const log = createLogger("provider:video:runway");

const RUNWAY_BASE_URL = "https://api.dev.runwayml.com/v1";
// Runway requires a dated API version header; verified current as of 2026-09-02 against
// api.dev.runwayml.com's own getting-started guide. If Runway rejects requests with a
// version-related error, check https://docs.dev.runwayml.com for the current value.
const RUNWAY_API_VERSION = "2024-11-06";
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface RunwayTaskCreateResponse {
  id: string;
  estimatedCost?: { credits: number };
}

interface RunwayTaskStatusResponse {
  id: string;
  status: "PENDING" | "THROTTLED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  output?: string[];
  failure?: string;
  failureCode?: string;
  progress?: number;
}

/**
 * Real video adapter using Runway's image-to-video API.
 *
 * Verified 2026-09-02 directly against Runway's official Node SDK source
 * (runwayml/sdk-node: resources/image-to-video.ts, resources/tasks.ts) and
 * API guide rather than guessed: base URL, the required X-Runway-Version
 * header, the task-based async flow (POST creates a task id; GET
 * /tasks/{id} polls {status, output: string[], failure, failureCode}), and
 * the "gen4_turbo" model identifier.
 *
 * Every model variant on this endpoint is image-conditioned — Runway has no
 * pure text-to-video path here — so this adapter requires a source image per
 * scene (see VideoGenerationRequest.referenceImageStorageKey, populated by
 * apps/worker/src/services/asset-generation.ts from the scene's own
 * already-generated IMAGE asset).
 */
export class RunwayVideoProvider implements VideoProvider {
  readonly name = "runway";
  readonly isMock = false;

  constructor(
    private readonly apiKey: string,
    private readonly storage: StorageProvider,
    private readonly model: string = "gen4_turbo",
  ) {
    if (!apiKey) throw new Error("RunwayVideoProvider requires an API key. Set VIDEO_API_KEY.");
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "X-Runway-Version": RUNWAY_API_VERSION,
      "Content-Type": "application/json",
    };
  }

  private async createTask(body: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${RUNWAY_BASE_URL}/image_to_video`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new ProviderRequestError(this.name, `Failed to create task (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as RunwayTaskCreateResponse;
    return data.id;
  }

  private async pollTask(taskId: string): Promise<string[]> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const res = await fetch(`${RUNWAY_BASE_URL}/tasks/${taskId}`, { headers: this.headers() });
      if (!res.ok) throw new ProviderRequestError(this.name, `Failed to poll task (${res.status}): ${await res.text()}`);
      const data = (await res.json()) as RunwayTaskStatusResponse;

      if (data.status === "SUCCEEDED") {
        if (!data.output?.length) throw new ProviderRequestError(this.name, "Task succeeded but returned no output.");
        return data.output;
      }
      if (data.status === "FAILED" || data.status === "CANCELLED") {
        throw new ProviderRequestError(this.name, `Task ${data.status.toLowerCase()}: ${data.failure ?? data.failureCode ?? "unknown reason"}`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new ProviderRequestError(this.name, `Task ${taskId} did not complete within ${POLL_TIMEOUT_MS / 1000}s.`);
  }

  private async imageToDataUri(storageKey: string): Promise<string> {
    const buffer = await this.storage.get(storageKey);
    const ext = storageKey.split(".").pop()?.toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }

  private async downloadAndStore(url: string, idempotencyKey: string): Promise<{ key: string; url: string }> {
    const res = await fetch(url);
    if (!res.ok) throw new ProviderRequestError(this.name, `Failed to download generated video (${res.status}).`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const key = `runway/videos/${idempotencyKey}.mp4`;
    return this.storage.upload({ key, body: buffer, contentType: "video/mp4" });
  }

  private async generateFromImage(imageStorageKey: string, promptText: string, durationSeconds: number, idempotencyKey: string): Promise<GenerationResult> {
    const promptImage = await this.imageToDataUri(imageStorageKey);
    const taskId = await this.createTask({
      model: this.model,
      promptImage,
      promptText,
      ratio: "1280:720",
      duration: clampToSupportedDuration(durationSeconds),
    });
    log.info({ taskId }, "created Runway generation task, polling for completion");
    const [outputUrl] = await this.pollTask(taskId);
    const stored = await this.downloadAndStore(outputUrl!, idempotencyKey);
    log.info({ taskId, key: stored.key }, "generated video via Runway");
    return {
      status: "READY",
      storageKey: stored.key,
      url: stored.url,
      durationSeconds,
      width: 1280,
      height: 720,
      mimeType: "video/mp4",
      costUsd: 0,
      metadata: { taskId, model: this.model },
    };
  }

  async generateVideo(request: VideoGenerationRequest): Promise<GenerationResult> {
    if (!request.referenceImageStorageKey) {
      throw new ProviderNotConfiguredError(
        this.name,
        "Runway's image_to_video requires a source image, but no referenceImageStorageKey was provided for this scene — ensure the GENERATE_IMAGE stage produced a READY image asset for it before GENERATE_VIDEO runs.",
      );
    }
    return this.generateFromImage(request.referenceImageStorageKey, request.directorSpec.action, request.directorSpec.durationSeconds, request.idempotencyKey);
  }

  async imageToVideo(request: ImageToVideoRequest): Promise<GenerationResult> {
    return this.generateFromImage(request.imageStorageKey, request.directorSpec.action, request.directorSpec.durationSeconds, request.idempotencyKey);
  }

  async extendVideo(_request: ExtendVideoRequest): Promise<GenerationResult> {
    // Runway's /v1 surface (as verified for this adapter) doesn't expose a "continue this
    // exact clip" endpoint — only fresh image/text-conditioned generation. Rather than fake
    // a continuation, this fails loudly with next steps instead of guessing at behavior.
    throw new ProviderNotConfiguredError(
      this.name,
      "extendVideo has no equivalent in Runway's current /v1 API — re-check https://docs.dev.runwayml.com for a dedicated extend/continue endpoint before implementing this.",
    );
  }
}

/**
 * Runway model variants generally accept only a small, discrete set of durations
 * (commonly 5 or 10 seconds) rather than an arbitrary range. The exact accepted set
 * isn't confirmed for every model variant, so this rounds to the nearer of the two
 * widely-documented values instead of guessing a continuous range.
 */
function clampToSupportedDuration(seconds: number): number {
  return seconds <= 7.5 ? 5 : 10;
}
