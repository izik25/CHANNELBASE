import { env } from "./env.js";

/**
 * Lightweight feature flags. Backed by env vars for now; the shape is
 * intentionally a plain object so a future DB-backed or remote flag service
 * can be swapped in without touching call sites (they just read `flags.x`).
 */
export interface FeatureFlags {
  youtubePublishing: boolean;
  autopilot: boolean;
  analytics: boolean;
  realVideoGeneration: boolean;
  realImageGeneration: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    youtubePublishing: env.FEATURE_YOUTUBE_PUBLISHING,
    autopilot: env.FEATURE_AUTOPILOT,
    analytics: env.FEATURE_ANALYTICS,
    realVideoGeneration: env.FEATURE_REAL_VIDEO_GENERATION,
    realImageGeneration: env.FEATURE_REAL_IMAGE_GENERATION,
  };
}

export const flags = getFeatureFlags();
