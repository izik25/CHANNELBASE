import { z } from "zod";

export const sceneDraftSchema = z.object({
  sceneNumber: z.number().int().positive(),
  durationEstimateSeconds: z.number().int().positive(),
  locationName: z.string().min(1),
  characterNames: z.array(z.string()).default([]),
  purpose: z.string().min(1),
  action: z.string().min(1),
  dialogue: z.array(
    z.object({
      characterName: z.string(),
      line: z.string(),
      emotion: z.string().optional(),
    }),
  ).default([]),
  narration: z.string().optional(),
  emotion: z.string().min(1),
  visualDescription: z.string().min(1),
  transition: z.string().default("cut"),
  continuityNotes: z.string().optional(),
});
export type SceneDraft = z.infer<typeof sceneDraftSchema>;

export const episodeScriptSchema = z.object({
  title: z.string().min(1),
  hook: z.string().min(1),
  summary: z.string().min(1),
  intro: z.string().min(1),
  beats: z.array(z.string()).default([]),
  ending: z.string().min(1),
  cta: z.string().min(1),
  scenes: z.array(sceneDraftSchema).min(1),
});
export type EpisodeScript = z.infer<typeof episodeScriptSchema>;

export const shotDraftSchema = z.object({
  shotNumber: z.number().int().positive(),
  sceneNumber: z.number().int().positive(),
  shotType: z.string().min(1), // e.g. "wide", "close-up", "over-the-shoulder"
  cameraMovement: z.string().default("static"),
  durationEstimateSeconds: z.number().positive(),
  description: z.string().min(1),
});
export type ShotDraft = z.infer<typeof shotDraftSchema>;
