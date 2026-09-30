import { createLogger } from "@channelbase/logger";
import type { BillingPlanDescriptor, BillingProvider, CreateCheckoutSessionParams } from "../interfaces.js";

const log = createLogger("provider:billing:mock");

const DEFAULT_PLANS: BillingPlanDescriptor[] = [
  { id: "free", name: "Free", priceUsd: 0, creditsPerMonth: 100 },
  { id: "creator", name: "Creator", priceUsd: 39, creditsPerMonth: 1500 },
  { id: "studio", name: "Studio", priceUsd: 149, creditsPerMonth: 8000 },
];

/**
 * Simulates checkout without touching a real payment processor. The
 * "checkout URL" resolves inside the app itself (apps/web billing settings
 * page) and immediately grants the subscription — good enough to exercise
 * Plan/Subscription/CreditWallet end-to-end in local development.
 */
export class MockBillingProvider implements BillingProvider {
  readonly name = "mock-billing";
  readonly isMock = true;

  async listPlans(): Promise<BillingPlanDescriptor[]> {
    return DEFAULT_PLANS;
  }

  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<{ checkoutUrl: string; sessionId: string }> {
    const sessionId = `mock-checkout-${Date.now()}`;
    log.info({ userId: params.userId, planId: params.planId }, "[MOCK] checkout session created");
    const url = new URL(params.successUrl);
    url.searchParams.set("mock_session_id", sessionId);
    url.searchParams.set("mock_plan_id", params.planId);
    return { checkoutUrl: url.toString(), sessionId };
  }

  async cancelSubscription(params: { externalSubscriptionId: string }): Promise<void> {
    log.info({ externalSubscriptionId: params.externalSubscriptionId }, "[MOCK] subscription canceled");
  }

  async parseWebhookEvent(): Promise<null> {
    return null;
  }
}
