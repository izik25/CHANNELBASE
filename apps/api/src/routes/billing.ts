import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@channelbase/database";
import { CreditService } from "@channelbase/ai";
import { env } from "@channelbase/config";
import { providerRouter } from "../lib/providers.js";
import { HttpError } from "../plugins/error-handler.js";

const checkoutSchema = z.object({ planId: z.string().min(1) });

export default async function billingRoutes(app: FastifyInstance) {
  app.get("/billing", { onRequest: [app.authenticate] }, async (request) => {
    const userId = request.user!.id;
    const [plans, wallet, subscription] = await Promise.all([
      prisma.plan.findMany({ orderBy: { priceUsd: "asc" } }),
      new CreditService().getOrCreateWallet(userId),
      prisma.subscription.findFirst({ where: { userId, status: "ACTIVE" }, include: { plan: true }, orderBy: { createdAt: "desc" } }),
    ]);
    return { plans, creditBalance: Number(wallet.balance), subscription, billingProvider: providerRouter.billing.name, isMockBilling: providerRouter.billing.isMock };
  });

  app.post("/billing/checkout", { onRequest: [app.authenticate] }, async (request) => {
    const { planId } = checkoutSchema.parse(request.body);
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new HttpError(404, "Plan not found.");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    const session = await providerRouter.billing.createCheckoutSession({
      userId: user.id,
      userEmail: user.email,
      planId: plan.id,
      successUrl: `${env.APP_URL}/settings/billing?checkout=success`,
      cancelUrl: `${env.APP_URL}/settings/billing?checkout=cancelled`,
    });

    // MockBillingProvider grants the subscription immediately since there's no real payment step to wait on.
    if (providerRouter.billing.isMock) {
      await prisma.subscription.updateMany({ where: { userId: user.id, status: "ACTIVE" }, data: { status: "CANCELED" } });
      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: "ACTIVE",
          billingProvider: "mock",
          externalSubscriptionId: session.sessionId,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      await new CreditService().grant(user.id, plan.creditsPerMonth, "SUBSCRIPTION_GRANT", `Subscribed to ${plan.name}`);
    }

    return { checkoutUrl: session.checkoutUrl };
  });

  app.post("/billing/cancel", { onRequest: [app.authenticate] }, async (request) => {
    const subscription = await prisma.subscription.findFirst({ where: { userId: request.user!.id, status: "ACTIVE" } });
    if (!subscription) throw new HttpError(404, "No active subscription to cancel.");
    if (subscription.externalSubscriptionId) {
      await providerRouter.billing.cancelSubscription({ externalSubscriptionId: subscription.externalSubscriptionId });
    }
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "CANCELED" } });
    return { ok: true };
  });

  // Stripe requires the unparsed request body to verify the webhook signature — see app.ts's
  // content-type parser, which stashes it on request.rawBody before JSON-parsing request.body.
  app.post("/billing/webhook", async (request, reply) => {
    const signature = request.headers["stripe-signature"] as string | undefined;
    const event = await providerRouter.billing.parseWebhookEvent({ payload: request.rawBody ?? "", signature });
    if (!event) return reply.send({ received: true });

    if (event.type === "subscription.created" || event.type === "subscription.updated") {
      await prisma.subscription.upsert({
        where: { externalSubscriptionId: event.externalSubscriptionId },
        update: { status: "ACTIVE" },
        create: {
          userId: event.userId,
          planId: event.planId,
          status: "ACTIVE",
          billingProvider: "stripe",
          externalSubscriptionId: event.externalSubscriptionId,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      }).catch(() => undefined);
    } else if (event.type === "subscription.canceled") {
      await prisma.subscription.updateMany({ where: { externalSubscriptionId: event.externalSubscriptionId }, data: { status: "CANCELED" } });
    }

    return reply.send({ received: true });
  });
}
