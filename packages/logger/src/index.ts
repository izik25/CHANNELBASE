import pino, { type Logger as PinoLogger } from "pino";

export type Logger = PinoLogger;

export interface LogContext {
  requestId?: string;
  jobId?: string;
  channelId?: string;
  episodeId?: string;
  userId?: string;
  provider?: string;
  operation?: string;
  [key: string]: unknown;
}

const SECRET_KEY_PATTERN = /(key|secret|token|password|authorization)/i;

/**
 * Redacts anything that looks like a credential before it reaches a log sink.
 * Provider adapters and the API layer must never log raw request/response
 * bodies without passing them through this first.
 */
export function redact(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map(redact);
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redact(value);
    }
    return out;
  }
  return input;
}

const baseLogger = pino({
  name: "channelbase",
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  redact: {
    paths: [
      "*.apiKey",
      "*.api_key",
      "*.password",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.encryptedAccessToken",
      "*.encryptedRefreshToken",
      "req.headers.authorization",
    ],
    censor: "[REDACTED]",
  },
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
      : undefined,
});

export function createLogger(scope: string, context: LogContext = {}): Logger {
  return baseLogger.child({ scope, ...context });
}

export const logger = createLogger("app");
