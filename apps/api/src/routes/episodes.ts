import type { FastifyInstance } from "fastify";
import { prisma } from "@channelbase/database";
import { env } from "@channelbase/config";
import { CostCalculator } from "@channelbase/ai";
import { EPISODE_PIPELINE_ORDER } from "@channelbase/shared";
import { HttpError } from "../plugins/error-handler.js";
import { createAndEnqueueJobRun } from "../services/job-service.js";
import { subscribeToEpisodeProgress, type EpisodeProgressEvent } from "../lib/pubsub.js";

async function getOwnedEpisodeOrThrow(episodeId: string, userId: string, role: "USER" | "ADMIN") {
  const episode = await prisma.episode.findUnique({ where: { id: episodeId }, include: { channel: true } });
  if (!episode || episode.deletedAt) throw new HttpError(404, "Episode not found.");
  if (episode.channel.userId !== userId && role !== "ADMIN") throw new HttpError(403, "You do not have access to this episode.");
  return episode;
}

const NON_STARTABLE_STATUSES = new Set(["ASSET_GENERATION", "VOICE_GENERATION", "VIDEO_GENERATION", "ASSEMBLY", "PUBLISHED"]);

export default async function episodeRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/episodes/:id", async (request) => {
    const { id } = request.params as { id: string };
    const episode = await getOwnedEpisodeOrThrow(id, request.user!.id, request.user!.role);
    const [scenes, assets, qualityReviews, cost, publishedContent] = await Promise.all([
      prisma.scene.findMany({ where: { episodeId: id }, include: { shots: true, characters: { include: { character: true } }, location: true }, orderBy: { sceneNumber: "asc" } }),
      prisma.asset.findMany({ where: { episodeId: id }, orderBy: { createdAt: "desc" } }),
      prisma.qualityReview.findMany({ where: { episodeId: id }, orderBy: { createdAt: "desc" }, take: 1 }),
      new CostCalculator().getEpisodeCost(id),
      prisma.publishedContent.findFirst({ where: { episodeId: id }, orderBy: { createdAt: "desc" } }),
    ]);
    return { episode, scenes, assets, qualityReview: qualityReviews[0] ?? null, cost, publishedContent };
  });

  app.post("/episodes/:id/publish", async (request, reply) => {
    const { id } = request.params as { id: string };
    const episode = await getOwnedEpisodeOrThrow(id, request.user!.id, request.user!.role);
    if (episode.status !== "READY") {
      throw new HttpError(409, `Episode must be READY to publish (current status: ${episode.status}).`);
    }

    const body = (request.body ?? {}) as { platformAccountId?: string; publishAt?: string };
    const platformAccount = body.platformAccountId
      ? await prisma.platformAccount.findUnique({ where: { id: body.platformAccountId } })
      : await prisma.platformAccount.findFirst({ where: { userId: request.user!.id, platform: "YOUTUBE" }, orderBy: { connectedAt: "desc" } });

    if (!platformAccount || platformAccount.userId !== request.user!.id) {
      throw new HttpError(400, "Connect a YouTube account in Settings before publishing.");
    }

    await prisma.episode.update({ where: { id }, data: { status: "SCHEDULED" } });
    const jobRun = await createAndEnqueueJobRun({
      jobType: "PUBLISH_VIDEO",
      entityId: episode.id,
      channelId: episode.channelId,
      episodeId: episode.id,
      payload: { episodeId: episode.id, platformAccountId: platformAccount.id, publishAt: body.publishAt },
      idempotencyKey: `publish-episode:${episode.id}:${Date.now()}`,
      // Unlike generation jobs, publishing should never silently auto-retry: retrying a
      // failed upload to a real platform without the user knowing risks double-publishing.
      // Fail fast, revert to READY (see processors/publish-video.ts), and let the user
      // explicitly click Publish again.
      maxAttempts: 1,
    });

    return reply.code(202).send({ jobRunId: jobRun.id });
  });

  app.post("/episodes/:id/generate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const episode = await getOwnedEpisodeOrThrow(id, request.user!.id, request.user!.role);
    if (NON_STARTABLE_STATUSES.has(episode.status) || episode.status === "READY") {
      throw new HttpError(409, `Episode is already in progress or complete (status: ${episode.status}).`);
    }

    await prisma.episode.update({ where: { id }, data: { status: "PLANNED", lastError: null } });
    const jobRun = await createAndEnqueueJobRun({
      jobType: "GENERATE_SCRIPT",
      entityId: episode.id,
      channelId: episode.channelId,
      episodeId: episode.id,
      payload: { episodeId: episode.id },
      idempotencyKey: `generate-episode:${episode.id}:${Date.now()}`,
    });

    return reply.code(202).send({ jobRunId: jobRun.id });
  });

  app.post("/episodes/:id/assets/:assetId/regenerate", async (request, reply) => {
    const { id, assetId } = request.params as { id: string; assetId: string };
    await getOwnedEpisodeOrThrow(id, request.user!.id, request.user!.role);
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.episodeId !== id) throw new HttpError(404, "Asset not found on this episode.");

    await prisma.asset.update({ where: { id: assetId }, data: { status: "QUEUED", error: null, reviewDecision: null } });
    const jobTypeByAssetType: Record<string, "GENERATE_IMAGE" | "GENERATE_VIDEO" | "GENERATE_VOICE" | "GENERATE_MUSIC" | "GENERATE_THUMBNAIL"> = {
      IMAGE: "GENERATE_IMAGE",
      VIDEO: "GENERATE_VIDEO",
      VOICE: "GENERATE_VOICE",
      MUSIC: "GENERATE_MUSIC",
      THUMBNAIL: "GENERATE_THUMBNAIL",
    };
    const jobType = jobTypeByAssetType[asset.type] ?? "GENERATE_IMAGE";
    const jobRun = await createAndEnqueueJobRun({
      jobType,
      entityId: asset.id,
      channelId: asset.channelId,
      episodeId: id,
      payload: { assetId: asset.id, episodeId: id, regenerate: true },
    });
    return reply.code(202).send({ jobRunId: jobRun.id });
  });

  app.post("/episodes/:id/scenes/:sceneId/review", async (request, reply) => {
    const { id, sceneId } = request.params as { id: string; sceneId: string };
    await getOwnedEpisodeOrThrow(id, request.user!.id, request.user!.role);
    const { decision } = request.body as { decision: "APPROVED" | "REJECTED" | "REGENERATE" };
    const scene = await prisma.scene.update({ where: { id: sceneId }, data: { reviewDecision: decision } });
    return reply.send({ scene });
  });

  app.get("/episodes/:id/progress", async (request, reply) => {
    const { id } = request.params as { id: string };
    const episode = await getOwnedEpisodeOrThrow(id, request.user!.id, request.user!.role);

    // See routes/channels.ts's build-status handler for why the CORS headers below are
    // required here even though @fastify/cors is registered globally.
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": env.APP_URL,
      "Access-Control-Allow-Credentials": "true",
    });

    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;
    const TERMINAL = new Set(["READY", "PUBLISHED", "FAILED"]);
    const send = (event: EpisodeProgressEvent) => {
      if (closed) return;
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const finish = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (poll) clearInterval(poll);
      if (unsubscribe) unsubscribe();
      reply.raw.end();
    };

    request.raw.on("close", finish);
    send({ episodeId: episode.id, status: episode.status, progress: 0, timestamp: new Date().toISOString() });
    if (TERMINAL.has(episode.status)) {
      finish();
      return;
    }

    // See routes/channels.ts's build-status handler for why the subscribe MUST be awaited
    // before any "is it already done?" check — mock providers can finish a whole episode
    // faster than an SSE handshake, and Redis pub/sub never replays missed messages.
    unsubscribe = await subscribeToEpisodeProgress(episode.id, (event) => {
      send(event);
      if (TERMINAL.has(event.status)) finish();
    });
    if (closed) {
      unsubscribe();
      return;
    }

    let lastSentStatus = episode.status;
    const checkState = async () => {
      if (closed) return;
      const current = await prisma.episode.findUnique({ where: { id: episode.id }, select: { status: true } });
      if (!current) return;

      if (TERMINAL.has(current.status)) {
        send({ episodeId: episode.id, status: current.status, progress: 100, timestamp: new Date().toISOString() });
        finish();
      } else if (current.status !== lastSentStatus) {
        lastSentStatus = current.status;
        const stageIndex = EPISODE_PIPELINE_ORDER.indexOf(current.status);
        const progress = stageIndex >= 0 ? Math.round((stageIndex / (EPISODE_PIPELINE_ORDER.length - 1)) * 100) : 0;
        send({ episodeId: episode.id, status: current.status, progress, timestamp: new Date().toISOString() });
      }
    };

    heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15000);
    poll = setInterval(checkState, 1500);
    await checkState();
  });
}
