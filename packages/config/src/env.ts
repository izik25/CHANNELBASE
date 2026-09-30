import { z } from "zod";

/**
 * Every variable here is optional at the schema level on purpose: the product
 * principle is "the app must continue to function using a MOCK PROVIDER" when
 * a credential is missing. Required-ness is enforced at the call site (e.g. the
 * real Anthropic adapter refuses to construct itself without LLM_API_KEY), not
 * globally at boot.
 */

/**
 * `z.coerce.boolean()` is a footgun for env vars: it just runs `Boolean(value)`,
 * and `Boolean("false")` is `true` because it's a non-empty string. This parses
 * the actual text of common truthy/falsy env var conventions instead.
 */
function booleanFromEnv(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((v) => (v === undefined ? defaultValue : ["true", "1", "yes", "on"].includes(v.toLowerCase())));
}
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().default("http://localhost:3000"),
  API_URL: z.string().default("http://localhost:4000"),
  API_PORT: z.coerce.number().default(4000),
  WEB_PORT: z.coerce.number().default(3000),

  JWT_SECRET: z.string().min(16).default("dev-jwt-secret-change-me-please-32chars-min"),
  ENCRYPTION_KEY: z.string().min(16).default("dev-encryption-key-change-me-32bytes!!"),

  DATABASE_URL: z.string().default("postgresql://channelbase:channelbase@localhost:5432/channelbase?schema=public"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().default("./storage/local"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanFromEnv(true),
  S3_PUBLIC_BASE_URL: z.string().optional(),

  LLM_PROVIDER: z.enum(["anthropic", "openai", "mock"]).default("mock"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("claude-sonnet-4-5"),

  IMAGE_PROVIDER: z.enum(["openai", "stability", "mock"]).default("mock"),
  IMAGE_API_KEY: z.string().optional(),
  IMAGE_MODEL: z.string().default("gpt-image-1"),

  VIDEO_PROVIDER: z.enum(["runway", "luma", "mock"]).default("mock"),
  VIDEO_API_KEY: z.string().optional(),
  VIDEO_MODEL: z.string().default("gen4_turbo"),

  VOICE_PROVIDER: z.enum(["elevenlabs", "mock"]).default("mock"),
  VOICE_API_KEY: z.string().optional(),
  VOICE_MODEL: z.string().default("eleven_multilingual_v2"),

  MUSIC_PROVIDER: z.enum(["mock"]).default("mock"),
  MUSIC_API_KEY: z.string().optional(),

  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REDIRECT_URI: z.string().optional(),

  TIKTOK_CLIENT_ID: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  INSTAGRAM_CLIENT_ID: z.string().optional(),
  INSTAGRAM_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),

  BILLING_PROVIDER: z.enum(["stripe", "mock"]).default("mock"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  FEATURE_YOUTUBE_PUBLISHING: booleanFromEnv(false),
  FEATURE_AUTOPILOT: booleanFromEnv(false),
  FEATURE_ANALYTICS: booleanFromEnv(true),
  FEATURE_REAL_VIDEO_GENERATION: booleanFromEnv(false),
  FEATURE_REAL_IMAGE_GENERATION: booleanFromEnv(false),

  LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();
