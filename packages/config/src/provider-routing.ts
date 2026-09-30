import { env } from "./env.js";

export type ProviderCategory = "llm" | "image" | "video" | "voice" | "music" | "publishing" | "storage" | "billing";

export interface ProviderRouteConfig {
  /** Logical operation this route applies to, e.g. "generateImage", "generateVideo:kids-animation" */
  category: ProviderCategory;
  /** Ordered by priority; router tries [0], then falls back down the list on failure. */
  chain: string[];
  enabled: boolean;
}

/**
 * Static default routing table. In production this is expected to be
 * overridden/extended from the `ProviderConfig` DB table (see
 * packages/database) so admins can change routing without a deploy — this
 * file only supplies the bootstrap defaults used when the DB table is empty
 * and the fallback used by workers that can't reach the DB.
 */
export function getDefaultProviderRouting(): ProviderRouteConfig[] {
  return [
    { category: "llm", chain: [env.LLM_PROVIDER === "mock" ? "mock-llm" : env.LLM_PROVIDER, "mock-llm"], enabled: true },
    { category: "image", chain: [env.IMAGE_PROVIDER === "mock" ? "mock-image" : env.IMAGE_PROVIDER, "mock-image"], enabled: true },
    { category: "video", chain: [env.VIDEO_PROVIDER === "mock" ? "mock-video" : env.VIDEO_PROVIDER, "mock-video"], enabled: true },
    { category: "voice", chain: [env.VOICE_PROVIDER === "mock" ? "mock-voice" : env.VOICE_PROVIDER, "mock-voice"], enabled: true },
    { category: "music", chain: ["mock-music"], enabled: true },
    { category: "publishing", chain: ["mock-youtube"], enabled: true },
  ];
}
