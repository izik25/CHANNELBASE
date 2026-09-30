import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@channelbase/database";
import { verifyAccessToken } from "../lib/jwt.js";

export interface AuthenticatedUser {
  id: string;
  role: "USER" | "ADMIN";
  sessionId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("user", undefined);

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    // EventSource (used for SSE build/episode progress streams) cannot set custom headers,
    // so those endpoints are also reachable with ?token=... — never accepted for non-GET requests.
    const queryToken = request.method === "GET" ? (request.query as Record<string, string> | undefined)?.token : undefined;
    const bearerToken = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : queryToken;
    if (!bearerToken) {
      return reply.code(401).send({ error: "Missing bearer token." });
    }
    try {
      const claims = verifyAccessToken(bearerToken);
      const session = await prisma.session.findUnique({ where: { id: claims.sessionId } });
      if (!session || session.expiresAt < new Date()) {
        return reply.code(401).send({ error: "Session expired or revoked." });
      }
      request.user = { id: claims.sub, role: claims.role, sessionId: claims.sessionId };
    } catch {
      return reply.code(401).send({ error: "Invalid or expired token." });
    }
  });

  app.decorate("requireAdmin", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== "ADMIN") {
      return reply.code(403).send({ error: "Admin access required." });
    }
  });
}

export default fp(authPlugin, { name: "auth-plugin" });
