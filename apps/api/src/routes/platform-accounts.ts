import type { FastifyInstance } from "fastify";
import { google } from "googleapis";
import { prisma } from "@channelbase/database";
import { env, getFeatureFlags } from "@channelbase/config";
import { providerRouter } from "../lib/providers.js";
import { encryptSecret } from "../lib/encryption.js";
import { HttpError } from "../plugins/error-handler.js";
import { recordAuditLog } from "../lib/audit.js";

const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

export default async function platformAccountRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/platform-accounts", async (request) => {
    const accounts = await prisma.platformAccount.findMany({
      where: { userId: request.user!.id },
      select: { id: true, platform: true, channelId: true, channelName: true, externalAccountId: true, connectedAt: true },
    });
    return { accounts };
  });

  app.get("/platform-accounts/youtube/start", async (request, reply) => {
    const realConfigured = getFeatureFlags().youtubePublishing && Boolean(env.YOUTUBE_CLIENT_ID);
    if (realConfigured) {
      const oauth2Client = new google.auth.OAuth2(env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET, env.YOUTUBE_REDIRECT_URI);
      const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: YOUTUBE_SCOPES,
        state: request.user!.id,
      });
      return reply.send({ authorizationUrl: url });
    }

    // No real YouTube OAuth client configured — connect instantly through the mock
    // provider instead of a 501, so the whole publish flow (connect → publish →
    // PublishedContent) can be exercised end-to-end without real credentials, the
    // same "always runnable through mocks" principle every other provider follows.
    const provider = providerRouter.getPublishingProvider("YOUTUBE", false);
    const connected = await provider.connectAccount({ authorizationCode: "mock", redirectUri: "" });
    await prisma.platformAccount.deleteMany({ where: { userId: request.user!.id, platform: "YOUTUBE" } });
    const account = await prisma.platformAccount.create({
      data: {
        userId: request.user!.id,
        platform: "YOUTUBE",
        externalAccountId: connected.externalAccountId,
        channelName: connected.channelName,
        encryptedAccessToken: encryptSecret(connected.accessToken),
        encryptedRefreshToken: connected.refreshToken ? encryptSecret(connected.refreshToken) : undefined,
        tokenExpiresAt: connected.expiresAt,
      },
    });
    await recordAuditLog({ userId: request.user!.id, action: "platform_account.connect", entityType: "PlatformAccount", entityId: account.id, metadata: { mock: true } });
    return reply.send({ mock: true, account });
  });

  app.get("/platform-accounts/youtube/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    if (!code || !state) throw new HttpError(400, "Missing OAuth code/state.");

    const provider = providerRouter.getPublishingProvider("YOUTUBE", true);
    if (provider.isMock) {
      throw new HttpError(501, "YouTube publishing is not configured with real credentials yet.");
    }

    const connected = await provider.connectAccount({ authorizationCode: code, redirectUri: env.YOUTUBE_REDIRECT_URI ?? "" });
    const account = await prisma.platformAccount.upsert({
      where: { platform_externalAccountId: { platform: "YOUTUBE", externalAccountId: connected.externalAccountId } },
      update: {
        encryptedAccessToken: encryptSecret(connected.accessToken),
        encryptedRefreshToken: connected.refreshToken ? encryptSecret(connected.refreshToken) : undefined,
        tokenExpiresAt: connected.expiresAt,
        channelName: connected.channelName,
      },
      create: {
        userId: state,
        platform: "YOUTUBE",
        externalAccountId: connected.externalAccountId,
        channelName: connected.channelName,
        encryptedAccessToken: encryptSecret(connected.accessToken),
        encryptedRefreshToken: connected.refreshToken ? encryptSecret(connected.refreshToken) : undefined,
        tokenExpiresAt: connected.expiresAt,
      },
    });

    await recordAuditLog({ userId: state, action: "platform_account.connect", entityType: "PlatformAccount", entityId: account.id });
    return reply.redirect(`${env.APP_URL}/settings/platforms?connected=youtube`);
  });

  app.delete("/platform-accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.platformAccount.findUnique({ where: { id } });
    if (!account || account.userId !== request.user!.id) throw new HttpError(404, "Account not found.");
    await prisma.platformAccount.delete({ where: { id } });
    return reply.code(204).send();
  });
}
