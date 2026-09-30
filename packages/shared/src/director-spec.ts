import { z } from "zod";

/**
 * DirectorSpec is the internal, provider-agnostic "universal media-generation
 * language". The Channel Brain and Script/Director engines only ever produce
 * DirectorSpecs. Provider adapters (in packages/providers) are the ONLY code
 * allowed to translate a DirectorSpec into a provider-specific request body —
 * nothing upstream should know an image/video model's prompt format exists.
 */
export const directorSpecSchema = z.object({
  sceneId: z.string(),
  shotId: z.string().optional(),
  durationSeconds: z.number().positive(),
  characters: z.array(
    z.object({
      characterId: z.string(),
      name: z.string(),
      visualPrompt: z.string(),
      negativePrompt: z.string().default(""),
    }),
  ).default([]),
  location: z
    .object({
      locationId: z.string().optional(),
      name: z.string(),
      visualPrompt: z.string(),
      negativePrompt: z.string().default(""),
    })
    .optional(),
  action: z.string().min(1),
  camera: z.object({
    shotType: z.string().default("medium"),
    movement: z.string().default("static"),
    framing: z.string().default("centered"),
  }),
  lighting: z.string().default("natural, soft"),
  mood: z.string().min(1),
  visualStyle: z.string().min(1),
  dialogue: z.array(
    z.object({
      characterName: z.string(),
      line: z.string(),
      emotion: z.string().optional(),
    }),
  ).default([]),
  narration: z.string().optional(),
  emotion: z.string().min(1),
  soundEffects: z.array(z.string()).default([]),
  musicDirection: z.string().optional(),
  transition: z.string().default("cut"),
  continuityConstraints: z.array(z.string()).default([]),
  negativeInstructions: z.array(z.string()).default([]),
});
export type DirectorSpec = z.infer<typeof directorSpecSchema>;
