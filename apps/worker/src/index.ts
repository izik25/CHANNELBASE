import { Worker, type Job } from "bullmq";
import { createLogger } from "@channelbase/logger";
import type { JobType } from "@channelbase/shared";
import { QUEUE_NAME, connection } from "./lib/queue.js";
import { processCreateChannel } from "./processors/create-channel.js";
import { processGenerateBrand } from "./processors/generate-brand.js";
import { processGenerateCharacters } from "./processors/generate-characters.js";
import { processGenerateContentPlan } from "./processors/generate-content-plan.js";
import { processGenerateScript } from "./processors/generate-script.js";
import { processBreakdownEpisode } from "./processors/breakdown-episode.js";
import { processGenerateImage } from "./processors/generate-image.js";
import { processGenerateVoice } from "./processors/generate-voice.js";
import { processGenerateVideo } from "./processors/generate-video.js";
import { processGenerateMusic } from "./processors/generate-music.js";
import { processAssembleVideo } from "./processors/assemble-video.js";
import { processGenerateThumbnail } from "./processors/generate-thumbnail.js";
import { processGenerateMetadata } from "./processors/generate-metadata.js";
import { processPublishVideo } from "./processors/publish-video.js";

const log = createLogger("worker");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Record<JobType, (payload: any) => Promise<void>> = {
  CREATE_CHANNEL: processCreateChannel,
  GENERATE_BRAND: processGenerateBrand,
  GENERATE_CHARACTERS: processGenerateCharacters,
  GENERATE_CONTENT_PLAN: processGenerateContentPlan,
  GENERATE_SCRIPT: processGenerateScript,
  BREAKDOWN_EPISODE: processBreakdownEpisode,
  GENERATE_IMAGE: processGenerateImage,
  GENERATE_VIDEO: processGenerateVideo,
  GENERATE_VOICE: processGenerateVoice,
  GENERATE_MUSIC: processGenerateMusic,
  ASSEMBLE_VIDEO: processAssembleVideo,
  GENERATE_THUMBNAIL: processGenerateThumbnail,
  GENERATE_METADATA: processGenerateMetadata,
  PUBLISH_VIDEO: processPublishVideo,
};

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    const handler = handlers[job.name as JobType];
    if (!handler) {
      log.error({ jobName: job.name, jobId: job.id }, "no handler registered for job type");
      return;
    }
    log.info({ jobName: job.name, jobId: job.id }, "processing job");
    await handler(job.data);
  },
  { connection, concurrency: 4 },
);

worker.on("failed", (job, err) => {
  log.error({ jobId: job?.id, jobName: job?.name, err: err.message }, "job threw unhandled error (processor should have caught this internally)");
});

worker.on("ready", () => log.info("worker ready and listening for jobs"));

process.on("SIGTERM", async () => {
  log.info("SIGTERM received, closing worker gracefully");
  await worker.close();
  process.exit(0);
});
