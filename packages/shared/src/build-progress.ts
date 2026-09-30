import { z } from "zod";

/**
 * The channel-creation workflow stages, in order. The web app never sees
 * provider names or job internals during this flow — only these labels.
 */
export const CHANNEL_BUILD_STAGES = [
  "UNDERSTANDING_CONCEPT",
  "BUILDING_AUDIENCE",
  "CREATING_BRAND",
  "CREATING_CHARACTERS",
  "PLANNING_CONTENT",
  "PREPARING_FIRST_EPISODES",
  "CHANNEL_READY",
] as const;
export type ChannelBuildStage = (typeof CHANNEL_BUILD_STAGES)[number];

export const CHANNEL_BUILD_STAGE_LABELS: Record<ChannelBuildStage, string> = {
  UNDERSTANDING_CONCEPT: "Understanding your idea",
  BUILDING_AUDIENCE: "Creating your audience",
  CREATING_BRAND: "Building your brand",
  CREATING_CHARACTERS: "Designing characters",
  PLANNING_CONTENT: "Planning your content",
  PREPARING_FIRST_EPISODES: "Preparing your first episodes",
  CHANNEL_READY: "Channel ready",
};

/** Cumulative percentage complete once a stage finishes. */
export const CHANNEL_BUILD_STAGE_PROGRESS: Record<ChannelBuildStage, number> = {
  UNDERSTANDING_CONCEPT: 12,
  BUILDING_AUDIENCE: 24,
  CREATING_BRAND: 42,
  CREATING_CHARACTERS: 60,
  PLANNING_CONTENT: 80,
  PREPARING_FIRST_EPISODES: 95,
  CHANNEL_READY: 100,
};

export const channelBuildProgressEventSchema = z.object({
  channelId: z.string(),
  stage: z.enum(CHANNEL_BUILD_STAGES),
  label: z.string(),
  progress: z.number().min(0).max(100),
  status: z.enum(["IN_PROGRESS", "COMPLETED", "FAILED"]),
  message: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.string(),
});
export type ChannelBuildProgressEvent = z.infer<typeof channelBuildProgressEventSchema>;
