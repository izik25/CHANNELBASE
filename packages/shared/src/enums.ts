/**
 * Cross-cutting enums shared by the database schema, API, worker and web app.
 * These are plain TS union types (not Zod-derived) so Prisma's generated
 * enums can be structurally matched against them; each has a matching Zod
 * schema below for runtime validation at API boundaries.
 */
import { z } from "zod";

export const USER_ROLES = ["USER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

export const CHANNEL_STATUSES = ["DRAFT", "BUILDING", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];
export const channelStatusSchema = z.enum(CHANNEL_STATUSES);

export const APPROVAL_MODES = ["MANUAL", "AUTOPILOT"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
export const approvalModeSchema = z.enum(APPROVAL_MODES);

export const PLATFORMS = ["YOUTUBE", "TIKTOK", "INSTAGRAM", "FACEBOOK"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const platformSchema = z.enum(PLATFORMS);

export const CONTENT_TYPES = ["LONG_VIDEO", "SHORT", "TRAILER", "TEASER", "COMMUNITY_POST"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const contentTypeSchema = z.enum(CONTENT_TYPES);

export const EPISODE_STATUSES = [
  "IDEA",
  "PLANNED",
  "SCRIPTING",
  "SCRIPT_REVIEW",
  "SCENE_BREAKDOWN",
  "ASSET_GENERATION",
  "VOICE_GENERATION",
  "VIDEO_GENERATION",
  "ASSEMBLY",
  "QUALITY_REVIEW",
  "READY",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];
export const episodeStatusSchema = z.enum(EPISODE_STATUSES);

/** Ordered pipeline — used by the orchestrator to know "what's next". */
export const EPISODE_PIPELINE_ORDER: EpisodeStatus[] = [
  "IDEA",
  "PLANNED",
  "SCRIPTING",
  "SCRIPT_REVIEW",
  "SCENE_BREAKDOWN",
  "ASSET_GENERATION",
  "VOICE_GENERATION",
  "VIDEO_GENERATION",
  "ASSEMBLY",
  "QUALITY_REVIEW",
  "READY",
];

export const ASSET_TYPES = [
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "VOICE",
  "MUSIC",
  "SFX",
  "THUMBNAIL",
  "LOGO",
  "BANNER",
  "AVATAR",
  "SUBTITLE",
  "FINAL_VIDEO",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const assetTypeSchema = z.enum(ASSET_TYPES);

export const ASSET_STATUSES = ["QUEUED", "GENERATING", "READY", "FAILED"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export const assetStatusSchema = z.enum(ASSET_STATUSES);

export const JOB_TYPES = [
  "CREATE_CHANNEL",
  "GENERATE_BRAND",
  "GENERATE_CHARACTERS",
  "GENERATE_CONTENT_PLAN",
  "GENERATE_SCRIPT",
  "BREAKDOWN_EPISODE",
  "GENERATE_IMAGE",
  "GENERATE_VIDEO",
  "GENERATE_VOICE",
  "GENERATE_MUSIC",
  "ASSEMBLE_VIDEO",
  "GENERATE_THUMBNAIL",
  "GENERATE_METADATA",
  "PUBLISH_VIDEO",
] as const;
export type JobType = (typeof JOB_TYPES)[number];
export const jobTypeSchema = z.enum(JOB_TYPES);

export const JOB_RUN_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "RETRYING"] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];
export const jobRunStatusSchema = z.enum(JOB_RUN_STATUSES);

export const CREDIT_TRANSACTION_TYPES = ["PURCHASE", "SUBSCRIPTION_GRANT", "GENERATION", "REFUND", "MANUAL_ADJUSTMENT"] as const;
export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];
export const creditTransactionTypeSchema = z.enum(CREDIT_TRANSACTION_TYPES);

export const REVIEW_DECISIONS = ["APPROVED", "REJECTED", "REGENERATE"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export const reviewDecisionSchema = z.enum(REVIEW_DECISIONS);

export const QUALITY_RISK_CATEGORIES = [
  "REPETITION_RISK",
  "LOW_VALUE_AUTOMATION_RISK",
  "COPYRIGHT_RISK",
  "CHILD_CONTENT_QUALITY_RISK",
] as const;
export type QualityRiskCategory = (typeof QUALITY_RISK_CATEGORIES)[number];
export const qualityRiskCategorySchema = z.enum(QUALITY_RISK_CATEGORIES);

export const PROVIDER_CATEGORIES = ["llm", "image", "video", "voice", "music", "publishing", "storage", "billing"] as const;
export type ProviderCategoryName = (typeof PROVIDER_CATEGORIES)[number];
export const providerCategorySchema = z.enum(PROVIDER_CATEGORIES);
