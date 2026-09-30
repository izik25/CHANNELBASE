import type { FastifyInstance } from "fastify";
import { prisma } from "@channelbase/database";
import { CostCalculator, CreditService } from "@channelbase/ai";

export default async function usageRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/usage", async (request) => {
    const userId = request.user!.id;
    const costCalculator = new CostCalculator();
    const [monthly, providerBreakdown, wallet, recentEvents] = await Promise.all([
      costCalculator.getUserMonthlyCost(userId),
      costCalculator.getProviderCostBreakdown(userId),
      new CreditService().getOrCreateWallet(userId),
      prisma.usageEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);

    return {
      creditBalance: Number(wallet.balance),
      monthly,
      providerBreakdown,
      recentEvents,
    };
  });

  app.get("/usage/channels/:channelId", async (request) => {
    const { channelId } = request.params as { channelId: string };
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || (channel.userId !== request.user!.id && request.user!.role !== "ADMIN")) {
      return { totalCostUsd: 0, totalCredits: 0, eventCount: 0 };
    }
    return new CostCalculator().getChannelCost(channelId);
  });
}
