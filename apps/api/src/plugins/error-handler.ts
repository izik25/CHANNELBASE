import fp from "fastify-plugin";
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { InsufficientCreditsError } from "@channelbase/ai";
import { createLogger } from "@channelbase/logger";

const log = createLogger("api:error-handler");

class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export { HttpError };

async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Validation failed.", details: error.flatten() });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error instanceof InsufficientCreditsError) {
      return reply.code(402).send({ error: error.message });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (typeof statusCode === "number" && statusCode < 500) {
      return reply.code(statusCode).send({ error: error.message });
    }

    log.error({ err: error, requestId: request.id, url: request.url }, "unhandled request error");
    return reply.code(500).send({ error: "Internal server error." });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: `Route not found: ${request.method} ${request.url}` });
  });
}

export default fp(errorHandlerPlugin, { name: "error-handler-plugin" });
