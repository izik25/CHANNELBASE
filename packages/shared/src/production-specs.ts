import { z } from "zod";

export const thumbnailSpecSchema = z.object({
  headline: z.string().min(1),
  characterNames: z.array(z.string()).default([]),
  emotion: z.string().min(1),
  scene: z.string().min(1),
  composition: z.string().min(1),
  background: z.string().min(1),
  textPlacement: z.string().default("bottom-third"),
  visualHook: z.string().min(1),
  brandRules: z.array(z.string()).default([]),
});
export type ThumbnailSpec = z.infer<typeof thumbnailSpecSchema>;

export const shortSpecSchema = z.object({
  hook: z.string().min(1),
  durationSeconds: z.number().int().positive().max(180),
  sourceEpisodeId: z.string().optional(),
  selectedMoments: z.array(
    z.object({
      startSeconds: z.number().min(0),
      endSeconds: z.number().positive(),
      reason: z.string(),
    }),
  ).default([]),
  captionStyle: z.string().default("bold-centered"),
  verticalCompositionInstructions: z.string().min(1),
  cta: z.string().min(1),
});
export type ShortSpec = z.infer<typeof shortSpecSchema>;

export const metadataSpecSchema = z.object({
  titleCandidates: z.array(z.string()).min(1),
  recommendedTitle: z.string().min(1),
  description: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  chapters: z.array(
    z.object({
      timestampSeconds: z.number().min(0),
      label: z.string(),
    }),
  ).default([]),
  categorySuggestion: z.string().optional(),
});
export type MetadataSpec = z.infer<typeof metadataSpecSchema>;
