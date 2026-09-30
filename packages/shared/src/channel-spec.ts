import { z } from "zod";

/**
 * ChannelSpec is the structured, machine-actionable representation of "what
 * the user asked for". The Channel Brain's only job is turning one natural
 * language prompt into a value that satisfies this schema. Every downstream
 * engine (brand, character, content, director) reads from this — never from
 * the raw prompt again.
 *
 * A channel's ChannelSpec is stored immutably as the baseline version; edits
 * produce a new ChannelSpecVersion row (see packages/database) rather than
 * mutating history.
 */

export const identitySchema = z.object({
  channelNameOptions: z.array(z.string()).min(1),
  channelName: z.string().min(1),
  tagline: z.string().min(1),
  language: z.string().min(2).default("en"),
  countryTarget: z.string().optional(),
  primaryPlatform: z.literal("YOUTUBE").default("YOUTUBE"),
  channelType: z.string().min(1), // e.g. "kids-education", "storytelling", "explainer"
  niche: z.string().min(1),
  subNiche: z.string().optional(),
});
export type ChannelIdentity = z.infer<typeof identitySchema>;

export const audienceSchema = z.object({
  targetAgeMin: z.number().int().min(0).max(120),
  targetAgeMax: z.number().int().min(0).max(120),
  targetAudienceDescription: z.string().min(1),
  educationalLevel: z.string().optional(),
  interests: z.array(z.string()).default([]),
  parentalConsiderations: z.string().optional(),
});
export type ChannelAudience = z.infer<typeof audienceSchema>;

export const positioningSchema = z.object({
  tone: z.string().min(1),
  personality: z.array(z.string()).default([]),
  contentGoals: z.array(z.string()).default([]),
  monetizationGoals: z.array(z.string()).default([]),
  competitiveDifferentiation: z.string().optional(),
  valueProposition: z.string().min(1),
});
export type ChannelPositioning = z.infer<typeof positioningSchema>;

export const visualStyleSchema = z.object({
  visualStyleDescription: z.string().min(1),
  thumbnailStyle: z.string().min(1),
  colorDirection: z.string().min(1),
  typographyDirection: z.string().optional(),
  logoDirection: z.string().min(1),
  avatarDirection: z.string().min(1),
  bannerDirection: z.string().min(1),
  illustrationStyle: z.string().optional(),
});
export type ChannelVisualStyle = z.infer<typeof visualStyleSchema>;

export const voiceStyleSchema = z.object({
  voiceStyleDescription: z.string().min(1),
  narratorPersonality: z.string().optional(),
  musicStyle: z.string().min(1),
  pacing: z.string().optional(),
});
export type ChannelVoiceStyle = z.infer<typeof voiceStyleSchema>;

export const contentStrategySchema = z.object({
  episodeLengthTargetSeconds: z.number().int().positive(),
  shortLengthTargetSeconds: z.number().int().positive().max(180),
  episodesPerWeek: z.number().int().min(0),
  shortsPerWeek: z.number().int().min(0),
  contentPillars: z.array(z.string()).min(1),
  seriesIdeas: z.array(z.string()).default([]),
});
export type ChannelContentStrategy = z.infer<typeof contentStrategySchema>;

export const publishingStrategySchema = z.object({
  platforms: z.array(z.enum(["YOUTUBE", "TIKTOK", "INSTAGRAM", "FACEBOOK"])).default(["YOUTUBE"]),
  publishingCadenceDescription: z.string().min(1),
  bestPublishingDays: z.array(z.string()).default([]),
  approvalMode: z.enum(["MANUAL", "AUTOPILOT"]).default("MANUAL"),
});
export type ChannelPublishingStrategy = z.infer<typeof publishingStrategySchema>;

export const characterSeedSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  shortDescription: z.string().min(1),
});
export type CharacterSeed = z.infer<typeof characterSeedSchema>;

export const worldSeedSchema = z.object({
  name: z.string().min(1),
  shortDescription: z.string().min(1),
});
export type WorldSeed = z.infer<typeof worldSeedSchema>;

export const safetyRuleSchema = z.object({
  rule: z.string().min(1),
  category: z.enum(["content", "visual", "language", "commercial"]).default("content"),
});
export type SafetyRule = z.infer<typeof safetyRuleSchema>;

export const productionRulesSchema = z.object({
  requiresCharacters: z.boolean().default(false),
  requiresWorldBible: z.boolean().default(false),
  maxSceneCount: z.number().int().positive().default(12),
  captionsRequired: z.boolean().default(true),
  allowedThemes: z.array(z.string()).default([]),
  disallowedThemes: z.array(z.string()).default([]),
  contentRating: z.enum(["ALL_AGES", "KIDS", "TEEN", "GENERAL"]).default("GENERAL"),
});
export type ProductionRules = z.infer<typeof productionRulesSchema>;

export const channelSpecSchema = z.object({
  specVersion: z.number().int().positive().default(1),
  sourcePrompt: z.string().min(1),
  identity: identitySchema,
  audience: audienceSchema,
  positioning: positioningSchema,
  visualStyle: visualStyleSchema,
  voiceStyle: voiceStyleSchema,
  contentStrategy: contentStrategySchema,
  publishingStrategy: publishingStrategySchema,
  characters: z.array(characterSeedSchema).default([]),
  worlds: z.array(worldSeedSchema).default([]),
  contentPillars: z.array(z.string()).min(1),
  safetyRules: z.array(safetyRuleSchema).default([]),
  productionRules: productionRulesSchema,
});
export type ChannelSpec = z.infer<typeof channelSpecSchema>;

/**
 * Looser schema used only for validating what the LLM returns before we
 * apply defaults/coercion via `channelSpecSchema`. Kept identical today but
 * separated so the Channel Brain can evolve prompt-facing leniency
 * independently from the strict internal contract.
 */
export const channelSpecDraftSchema = channelSpecSchema;

export function parseChannelSpec(input: unknown): ChannelSpec {
  return channelSpecSchema.parse(input);
}
