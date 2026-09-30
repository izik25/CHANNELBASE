import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@channelbase/database";
import { CostCalculator } from "@channelbase/ai";
import { enqueueJob } from "../lib/queue.js";
import { HttpError } from "../plugins/error-handler.js";

const updateProviderConfigSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);
  app.addHook("onRequest", app.requireAdmin);

  /**
   * The customer-facing product deliberately never shows raw provider cost (only
   * credits) — that number belongs here, on the admin "who's costing us money" view.
   */
  app.get("/admin/users", async () => {
    const [users, costRows] = await Promise.all([
      prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          _count: { select: { channels: true } },
          creditWallet: { select: { balance: true } },
          subscriptions: {
            where: { status: "ACTIVE" },
            select: { plan: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.usageEvent.groupBy({
        by: ["userId"],
        _sum: { estimatedProviderCostUsd: true, creditsCharged: true },
        _count: true,
      }),
    ]);

    const costByUser = new Map(costRows.map((r) => [r.userId, r]));
    const enriched = users.map((u) => {
      const cost = costByUser.get(u.id);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
        channelCount: u._count.channels,
        creditBalance: Number(u.creditWallet?.balance ?? 0),
        planName: u.subscriptions[0]?.plan.name ?? "Free",
        totalCostUsd: Number(cost?._sum.estimatedProviderCostUsd ?? 0),
        totalCreditsCharged: Number(cost?._sum.creditsCharged ?? 0),
        usageEventCount: cost?._count ?? 0,
      };
    });

    return { users: enriched };
  });

  /** Drill-down for one customer: channels, subscription, and a real usage/cost ledger. */
  app.get("/admin/users/:id", async (request) => {
    const { id } = request.params as { id: string };
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        creditWallet: { select: { balance: true } },
        subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 },
        channels: { select: { id: true, name: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!user) throw new HttpError(404, "User not found.");

    const costCalculator = new CostCalculator();
    const [monthly, providerBreakdown, recentEvents] = await Promise.all([
      costCalculator.getUserMonthlyCost(id),
      costCalculator.getProviderCostBreakdown(id),
      prisma.usageEvent.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);

    return { user, monthly, providerBreakdown, recentEvents };
  });

  app.get("/admin/channels", async () => {
    const [channels, costRows] = await Promise.all([
      prisma.channel.findMany({
        include: { user: { select: { email: true } }, _count: { select: { episodes: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.usageEvent.groupBy({ by: ["channelId"], _sum: { estimatedProviderCostUsd: true, creditsCharged: true } }),
    ]);
    const costByChannel = new Map(costRows.filter((r) => r.channelId).map((r) => [r.channelId, r]));
    const enriched = channels.map((c) => ({
      ...c,
      totalCostUsd: Number(costByChannel.get(c.id)?._sum.estimatedProviderCostUsd ?? 0),
      totalCreditsCharged: Number(costByChannel.get(c.id)?._sum.creditsCharged ?? 0),
    }));
    return { channels: enriched };
  });

  app.get("/admin/jobs", async (request) => {
    const query = request.query as { status?: string };
    const jobs = await prisma.jobRun.findMany({
      where: query.status ? { status: query.status as never } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { jobs };
  });

  app.get("/admin/jobs/failed", async () => {
    const jobs = await prisma.jobRun.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 200 });
    return { jobs };
  });

  app.post("/admin/jobs/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const jobRun = await prisma.jobRun.findUnique({ where: { id } });
    if (!jobRun) throw new HttpError(404, "Job not found.");

    await prisma.jobRun.update({ where: { id }, data: { status: "PENDING", error: null, attemptCount: 0 } });
    await enqueueJob(jobRun.jobType, { jobRunId: jobRun.id, ...(jobRun.payload as Record<string, unknown> | null) });
    return reply.send({ ok: true });
  });

  app.get("/admin/providers", async () => {
    const providers = await prisma.providerConfig.findMany({ orderBy: [{ category: "asc" }, { priority: "asc" }] });
    return { providers };
  });

  app.patch("/admin/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateProviderConfigSchema.parse(request.body);
    const provider = await prisma.providerConfig.update({ where: { id }, data: body });
    return reply.send({ provider });
  });

  app.get("/admin/usage", async () => {
    const [totalUsers, totalChannels, totalEpisodes, costAgg] = await Promise.all([
      prisma.user.count(),
      prisma.channel.count(),
      prisma.episode.count(),
      prisma.usageEvent.aggregate({ _sum: { estimatedProviderCostUsd: true, creditsCharged: true } }),
    ]);
    return {
      totalUsers,
      totalChannels,
      totalEpisodes,
      totalCostUsd: Number(costAgg._sum.estimatedProviderCostUsd ?? 0),
      totalCreditsCharged: Number(costAgg._sum.creditsCharged ?? 0),
    };
  });

  app.get("/admin/subscriptions", async () => {
    const subscriptions = await prisma.subscription.findMany({ include: { user: { select: { email: true } }, plan: true }, orderBy: { createdAt: "desc" }, take: 200 });
    return { subscriptions };
  });
}
