import Stripe from "stripe";
import { createLogger } from "@channelbase/logger";
import type { BillingPlanDescriptor, BillingProvider, CreateCheckoutSessionParams } from "../interfaces.js";

const log = createLogger("provider:billing:stripe");

/**
 * Real billing adapter backed by Stripe Checkout + Subscriptions.
 *
 * Activation steps:
 *   1. Create Products/Prices in the Stripe dashboard matching the Plan rows
 *      seeded in the database (see prisma/seed.ts) — store the Stripe Price id
 *      in Plan.features.stripePriceId (or add a column if you prefer).
 *   2. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env, BILLING_PROVIDER=stripe.
 *   3. Point a Stripe webhook at POST /billing/webhook (apps/api) for the events:
 *      checkout.session.completed, customer.subscription.updated, customer.subscription.deleted.
 *   4. listPlans() below currently reads Stripe Prices directly; adjust to your
 *      catalog structure once real Products exist.
 */
export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe";
  readonly isMock = false;
  private readonly client: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string | undefined,
  ) {
    if (!secretKey) throw new Error("StripeBillingProvider requires STRIPE_SECRET_KEY.");
    this.client = new Stripe(secretKey);
  }

  async listPlans(): Promise<BillingPlanDescriptor[]> {
    const prices = await this.client.prices.list({ active: true, expand: ["data.product"] });
    return prices.data.map((price) => ({
      id: price.id,
      name: typeof price.product === "object" && "name" in price.product ? price.product.name : price.id,
      priceUsd: (price.unit_amount ?? 0) / 100,
      creditsPerMonth: Number((price.metadata as Record<string, string> | undefined)?.creditsPerMonth ?? 0),
    }));
  }

  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<{ checkoutUrl: string; sessionId: string }> {
    const session = await this.client.checkout.sessions.create({
      mode: "subscription",
      customer_email: params.userEmail,
      line_items: [{ price: params.planId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.userId,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { checkoutUrl: session.url, sessionId: session.id };
  }

  async cancelSubscription(params: { externalSubscriptionId: string }): Promise<void> {
    await this.client.subscriptions.cancel(params.externalSubscriptionId);
  }

  async parseWebhookEvent(params: { payload: string; signature: string | undefined }): ReturnType<BillingProvider["parseWebhookEvent"]> {
    if (!this.webhookSecret || !params.signature) {
      log.warn("received webhook without signature/secret configured — ignoring");
      return null;
    }
    const event = this.client.webhooks.constructEvent(params.payload, params.signature, this.webhookSecret);
    switch (event.type) {
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        return { type: "subscription.created", userId: sub.metadata.userId ?? "", planId: sub.items.data[0]?.price.id ?? "", externalSubscriptionId: sub.id };
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        return { type: "subscription.updated", userId: sub.metadata.userId ?? "", planId: sub.items.data[0]?.price.id ?? "", externalSubscriptionId: sub.id };
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        return { type: "subscription.canceled", userId: sub.metadata.userId ?? "", planId: sub.items.data[0]?.price.id ?? "", externalSubscriptionId: sub.id };
      }
      default:
        return null;
    }
  }
}
