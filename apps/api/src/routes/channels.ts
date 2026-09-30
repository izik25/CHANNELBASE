import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@channelbase/database";
import { env } from "@channelbase/config";
import type { ChannelBuildProgressEvent } from "@channelbase/shared";
import { CHANNEL_BUILD_STAGE_LABELS } from "@channelbase/shared";
import { HttpError } from "../plugins/error-handler.js";
import { getOwnedChannelOrThrow, deriveWorkingTitle } from "../services/channel-service.js";
import { createAndEnqueueJobRun } from "../services/job-service.js";
import { subscribeToBuildProgress } from "../lib/pubsub.js";
import { recordAuditLog } from "../lib/audit.js";

const createChannelSchema = z.object({
  prompt: z.string().min(10, "Describe your channel in a bit more detail."),
});

const settingsSchema = z.object({
  language: z.string().min(2).optional(),
  countryTarget: z.string().optional(),
  approvalMode: z.enum(["MANUAL", "AUTOPILOT"]).optional(),
  monthlySpendLimitUsd: z.number().positive().nullable().optional(),
});

const createEpisodeSchema = z.object({
  title: z.string().min(1),
  format: z.enum(["LONG_VIDEO", "SHORT", "TRAILER", "TEASER", "COMMUNITY_POST"]).default("LONG_VIDEO"),
  targetDurationSeconds: z.number().int().positive(),
  seriesId: z.string().optional(),
});

export default async function channelRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/channels", async (request) => {
    const channels = await prisma.channel.findMany({
      where: { userId: request.user!.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return { channels };
  });

  app.post("/channels", async (request, reply) => {
    const { prompt } = createChannelSchema.parse(request.body);
    const channel = await prisma.channel.create({
      data: {
        userId: request.user!.id,
        name: deriveWorkingTitle(prompt),
        draftPrompt: prompt,
        status: "DRAFT",
      },
    });
    await recordAuditLog({ userId: request.user!.id, action: "channel.create", entityType: "Channel", entityId: channel.id });
    return reply.code(201).send({ channel });
  });

  app.get("/channels/:id", async (request) => {
    const { id } = request.params as { id: string };
    const channel = await getOwnedChannelOrThrow(id, request.user!.id, request.user!.role);
    const [latestSpec, characterCount, episodeCount] = await Promise.all([
      prisma.channelSpecVersion.findFirst({ where: { channelId: id }, orderBy: { version: "desc" } }),
      prisma.character.count({ where: { channelId: id, deletedAt: null } }),
      prisma.episode.count({ where: { channelId: id, deletedAt: null } }),
    ]);
    return { channel, latestSpec, characterCount, episodeCount };
  });

  app.delete("/channels/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const channel = await getOwnedChannelOrThrow(id, request.user!.id, request.user!.role);
    await prisma.channel.update({ where: { id: channel.id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
    await recordAuditLog({ userId: request.user!.id, action: "channel.delete", entityType: "Channel", entityId: channel.id });
    return reply.code(204).send();
  });

  app.post("/channels/:id/build", async (request, reply) => {
    const { id } = request.params as { id: string };
    const channel = await getOwnedChannelOrThrow(id, request.user!.id, request.user!.role);
    if (!channel.draftPrompt) throw new HttpError(400, "This channel has no pending prompt to build from.");
    if (channel.status === "BUILDING") throw new HttpError(409, "This channel is already building.");

    await prisma.channel.update({ where: { id: channel.id }, data: { status: "BUILDING" } });
    const jobRun = await createAndEnqueueJobRun({
      jobType: "CREATE_CHANNEL",
      entityId: channel.id,
      channelId: channel.id,
      payload: { channelId: channel.id, prompt: channel.draftPrompt },
      idempotencyKey: `create-channel:${channel.id}`,
    });

    return reply.code(202).send({ jobRunId: jobRun.id });
  });

  /**
   * Server-Sent Events stream of build progress. The web app never sees
   * provider names or job internals here — only the 7 named stages from
   * @channelbase/shared's CHANNEL_BUILD_STAGES.
   */
  app.get("/channels/:id/build-status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const channel = await getOwnedChannelOrThrow(id, request.user!.id, request.user!.role);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // This route writes the response via reply.raw directly (required to stream SSE
      // chunks as they're produced), which bypasses Fastify's normal reply pipeline —
      // and with it, the CORS headers @fastify/cors would otherwise attach via
      // reply.header(). Without this, the browser (unlike curl, which ignores CORS
      // entirely) silently discards the whole response and EventSource never fires
      // onmessage, which looks exactly like "stuck with no error and no data."
      "Access-Control-Allow-Origin": env.APP_URL,
      "Access-Control-Allow-Credentials": "true",
    });

    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;
    const send = (event: ChannelBuildProgressEvent) => {
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

    // Redis pub/sub has no message replay, and mock providers can finish a whole channel
    // build in well under a second — so the subscription MUST be live before we ever check
    // "is it already done?", or a fast build's progress events vanish into a gap between
    // the check and the subscribe call, leaving the client stuck at its initial state
    // forever. subscribeToBuildProgress's promise only resolves once Redis has acknowledged
    // the SUBSCRIBE, closing that gap; the poll below is a second, belt-and-suspenders
    // safety net in case of any other missed message.
    unsubscribe = await subscribeToBuildProgress(channel.id, (event) => {
      send(event);
      if ((event.status === "COMPLETED" && event.stage === "CHANNEL_READY") || event.status === "FAILED") finish();
    });
    if (closed) {
      // The stream was already closed (client disconnected) while we were awaiting the
      // subscribe call — tear down the connection we just opened instead of leaking it.
      unsubscribe();
      return;
    }

    let lastSentProgress = -1;
    // Polls JobRun as a fallback to pub/sub, both for the terminal state (see the big
    // comment above) AND for in-progress snapshots: mock providers can blow through every
    // stage between two 1.5s polls, so most of the time this still only shows a couple of
    // stages before COMPLETED — that's expected and fine (a real provider taking real time
    // per stage would show the full animation); what matters is the stream always reaches
    // a terminal state instead of hanging on the client's initial optimistic guess.
    const checkState = async () => {
      if (closed) return;
      const latestJobRun = await prisma.jobRun.findFirst({
        where: { channelId: channel.id, jobType: "CREATE_CHANNEL" },
        orderBy: { createdAt: "desc" },
      });
      if (!latestJobRun) return;

      if (latestJobRun.status === "COMPLETED") {
        send({
          channelId: channel.id,
          stage: "CHANNEL_READY",
          label: CHANNEL_BUILD_STAGE_LABELS.CHANNEL_READY,
          progress: 100,
          status: "COMPLETED",
          timestamp: new Date().toISOString(),
        });
        finish();
      } else if (latestJobRun.status === "FAILED") {
        send({
          channelId: channel.id,
          stage: "UNDERSTANDING_CONCEPT",
          label: "Channel build failed",
          progress: latestJobRun.progress,
          status: "FAILED",
          error: latestJobRun.error ?? "Unknown error",
          timestamp: new Date().toISOString(),
        });
        finish();
      } else if (latestJobRun.progress > lastSentProgress) {
        lastSentProgress = latestJobRun.progress;
        const stage = (latestJobRun.stage as keyof typeof CHANNEL_BUILD_STAGE_LABELS | null) ?? "UNDERSTANDING_CONCEPT";
        send({
          channelId: channel.id,
          stage,
          label: CHANNEL_BUILD_STAGE_LABELS[stage] ?? "Building your channel",
          progress: latestJobRun.progress,
          status: "IN_PROGRESS",
          timestamp: new Date().toISOString(),
        });
      }
    };

    heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15000);
    poll = setInterval(checkState, 1500);
    await checkState();
  });

  app.get("/channels/:id/brand", async (request) => {
    const { id } = request.params as { id: string };
    await getOwnedChannelOrThrow(id, request.user!.id, request.user!.role);
    const brand = await prisma.brandBible.findFirst({ where: { channelId: id }, orderBy: { version: "desc" } });
    return { brand };
  });

  app.get("/channels/:id/worlds", async (request) => {
    const { id } = request.params as { id: string };
    await getOwnedChannelOrThrow(id, request.user!.id, request.user!.role);
    const worlds = await prisma.world.findMany({ where: { channelId: id }, include: { locations: true } });
    return { worlds };
  });

  app.get("/channels/:id/characters", async (request) => {
    const { id } = request.params as { id: string };
    await getOwnedChannelOrThrow(id, request.user!.id, request.user!.role);
    const characters = await prisma.character.findMany({
      where: { channelId: id, deletedAt: null },
      include: { references: { include: { asset: true } } },
      orderBy: { createdAt: "asc" },
    });
    return { characters };
  });

  app.get("/channels/:id/calendar", async (request) => {
    const { id } = request.params as { id: string };
    await getOwnedChannelOrThrow(id, request.user!.id, request.user!.role);
    const plans = await prisma.contentPlan.findMany({
      where: { channelId: id },
      include: { items: { include: { episode: true }, orderBy: { targetPublishDate: "asc" } } },
      orderBy: { periodStart: "desc" },
    });
    return { plans };
  });

  app.get("/channels/:id/content", async (request) => {
    const { id } = request.params as { id: string };
    await getOwnedChannelOrThrow(id, request.user!.id, request.user!.role);
    const episodes = await prisma.episode.findMany({
      where: { channelId: id, deletedAt: null },
      include: { series: true, assets: { where: { type: "THUMBNAIL" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    });
    return { episodes };
  });

  app.post("/channels/:id/episodes", async (request, reply) => {
    const { id } = request.params as { id: string };
    await getOwnedChannelOrThrow(id, request.user!.id, request.user!.role);
    const body = createEpisodeSchema.parse(request.body);
    const episode = await prisma.episode.create({
      data: {
        channelId: id,
        title: body.title,
        format: body.format,
        targetDurationSeconds: body.targetDurationSeconds,
        seriesId: body.seriesId,
        status: "IDEA",
      },
    });
    return reply.code(201).send({ episode });
  });

  app.patch("/channels/:id/settings", async (request, reply) => {
    const { id } = request.params as { id: string };
    const channel = await getOwnedChannelOrThrow(id, request.user!.id, request.user!.role);
    const body = settingsSchema.parse(request.body);

    if (body.approvalMode === "AUTOPILOT") {
      throw new HttpError(
        403,
        "AUTOPILOT is experimental and disabled until the publishing safety review flow ships. Use MANUAL approval for now.",
      );
    }

    const updated = await prisma.channel.update({
      where: { id: channel.id },
      data: {
        language: body.language,
        countryTarget: body.countryTarget,
        approvalMode: body.approvalMode,
        monthlySpendLimitUsd: body.monthlySpendLimitUsd,
      },
    });
    return reply.send({ channel: updated });
  });
}
