import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@channelbase/database";
import { CreditService } from "@channelbase/ai";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signAccessToken } from "../lib/jwt.js";
import { HttpError } from "../plugins/error-handler.js";
import { recordAuditLog } from "../lib/audit.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNUP_BONUS_CREDITS = 200;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function createSession(userId: string, role: "USER" | "ADMIN", userAgent?: string, ipAddress?: string) {
  const tokenHash = crypto.randomBytes(24).toString("hex");
  const session = await prisma.session.create({
    data: { userId, tokenHash, userAgent, ipAddress, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  const accessToken = signAccessToken({ sub: userId, role, sessionId: session.id });
  return accessToken;
}

export default async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new HttpError(409, "An account with this email already exists.");

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({ data: { email: body.email, passwordHash, name: body.name } });

    await new CreditService().grant(user.id, SIGNUP_BONUS_CREDITS, "SUBSCRIPTION_GRANT", "Welcome credits");
    await recordAuditLog({ userId: user.id, action: "user.register", entityType: "User", entityId: user.id, ipAddress: request.ip });

    const accessToken = await createSession(user.id, user.role, request.headers["user-agent"], request.ip);
    return reply.code(201).send({ accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user?.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password.");
    }

    const accessToken = await createSession(user.id, user.role, request.headers["user-agent"], request.ip);
    await recordAuditLog({ userId: user.id, action: "user.login", entityType: "User", entityId: user.id, ipAddress: request.ip });
    return reply.send({ accessToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  app.post("/auth/logout", { onRequest: [app.authenticate] }, async (request, reply) => {
    await prisma.session.delete({ where: { id: request.user!.sessionId } }).catch(() => undefined);
    return reply.send({ ok: true });
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user!.id } });
    const wallet = await new CreditService().getOrCreateWallet(user.id);
    return reply.send({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      creditBalance: Number(wallet.balance),
      createdAt: user.createdAt,
    });
  });

  /**
   * Google OAuth placeholder — the adapter interface (see docs/PROVIDERS.md
   * "Adding an auth provider") is ready but not wired to a real Google
   * client in V1. Returns 501 with clear next steps instead of silently
   * failing so the web app can detect and hide the button until configured.
   */
  app.get("/auth/google/start", async (_request, reply) => {
    throw new HttpError(501, "Google OAuth is not configured. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET and implement apps/api/src/routes/auth.ts google callback.");
  });
}
