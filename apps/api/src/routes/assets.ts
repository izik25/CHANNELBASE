import type { FastifyInstance } from "fastify";
import { prisma } from "@channelbase/database";
import { HttpError } from "../plugins/error-handler.js";

export default async function assetRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/assets", async (request) => {
    const query = request.query as { channelId?: string; type?: string; episodeId?: string };
    if (!query.channelId) throw new HttpError(400, "channelId query parameter is required.");

    const channel = await prisma.channel.findUnique({ where: { id: query.channelId } });
    if (!channel || (channel.userId !== request.user!.id && request.user!.role !== "ADMIN")) {
      throw new HttpError(403, "You do not have access to this channel's assets.");
    }

    const assets = await prisma.asset.findMany({
      where: {
        channelId: query.channelId,
        ...(query.type ? { type: query.type as never } : {}),
        ...(query.episodeId ? { episodeId: query.episodeId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { assets };
  });

  app.get("/assets/:id", async (request) => {
    const { id } = request.params as { id: string };
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new HttpError(404, "Asset not found.");
    const channel = await prisma.channel.findUnique({ where: { id: asset.channelId } });
    if (!channel || (channel.userId !== request.user!.id && request.user!.role !== "ADMIN")) {
      throw new HttpError(403, "You do not have access to this asset.");
    }
    return { asset };
  });
}
