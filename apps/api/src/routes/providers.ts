import type { FastifyInstance } from "fastify";
import { getFeatureFlags } from "@channelbase/config";
import { providerRouter } from "../lib/providers.js";

const CATEGORIES = ["llm", "image", "video", "voice", "music"] as const;

/**
 * Read-only, non-technical-safe view of provider configuration — used by
 * the web app to show e.g. "Using mock image generation" badges without
 * exposing API keys or internal adapter details beyond a display name.
 */
export default async function providerInfoRoutes(app: FastifyInstance) {
  app.get("/providers", { onRequest: [app.authenticate] }, async () => {
    const summary = CATEGORIES.map((category) => {
      const list = providerRouter.listProviders(category);
      const active = list.find((p) => !p.isMock) ?? list[0];
      return { category, active: active?.name ?? "none", isMock: active?.isMock ?? true, available: list.map((p) => p.name) };
    });
    return { providers: summary, featureFlags: getFeatureFlags() };
  });
}
