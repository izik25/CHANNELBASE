import { promises as fs } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { env } from "@channelbase/config";
import { resolveLocalStoragePath } from "@channelbase/providers";
import { createLogger } from "@channelbase/logger";
import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import authRoutes from "./routes/auth.js";
import channelRoutes from "./routes/channels.js";
import episodeRoutes from "./routes/episodes.js";
import assetRoutes from "./routes/assets.js";
import usageRoutes from "./routes/usage.js";
import billingRoutes from "./routes/billing.js";
import providerInfoRoutes from "./routes/providers.js";
import platformAccountRoutes from "./routes/platform-accounts.js";
import adminRoutes from "./routes/admin.js";

const log = createLogger("api");

export async function buildServer() {
  const app = Fastify({
    loggerInstance: log,
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 10 * 1024 * 1024,
  });

  // Stash the raw body before Fastify's default JSON parser consumes it — needed
  // to verify the Stripe webhook signature in routes/billing.ts.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    request.rawBody = body as string;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(cors, { origin: env.APP_URL, credentials: true });
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  if (env.STORAGE_DRIVER === "local") {
    const basePath = resolveLocalStoragePath();
    // @fastify/static requires its root directory to exist at registration time; nothing
    // may have been uploaded yet on a fresh checkout, so ensure it's there.
    await fs.mkdir(basePath, { recursive: true });
    await app.register(fastifyStatic, { root: basePath, prefix: "/storage/", decorateReply: false });
  }

  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(channelRoutes);
  await app.register(episodeRoutes);
  await app.register(assetRoutes);
  await app.register(usageRoutes);
  await app.register(billingRoutes);
  await app.register(providerInfoRoutes);
  await app.register(platformAccountRoutes);
  await app.register(adminRoutes);

  return app;
}
