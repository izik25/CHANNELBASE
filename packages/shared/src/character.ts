import { z } from "zod";

export const characterAppearanceSchema = z.object({
  ageDescription: z.string().min(1),
  heightDescription: z.string().optional(),
  bodyDescription: z.string().min(1),
  faceDescription: z.string().min(1),
  hairDescription: z.string().optional(),
  eyeDescription: z.string().optional(),
  clothingDescription: z.string().min(1),
  accessories: z.array(z.string()).default([]),
});
export type CharacterAppearance = z.infer<typeof characterAppearanceSchema>;

export const characterPersonalitySchema = z.object({
  personality: z.array(z.string()).min(1),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  catchphrases: z.array(z.string()).default([]),
  speechStyle: z.string().min(1),
});
export type CharacterPersonality = z.infer<typeof characterPersonalitySchema>;

export const characterDraftSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  species: z.string().min(1),
  genderPresentation: z.string().optional(),
  appearance: characterAppearanceSchema,
  personality: characterPersonalitySchema,
  visualPrompt: z.string().min(1),
  negativePrompt: z.string().default(""),
  consistencyRules: z.array(z.string()).default([]),
  doNotChangeRules: z.array(z.string()).default([]),
});
export type CharacterDraft = z.infer<typeof characterDraftSchema>;

export const CHARACTER_REFERENCE_KINDS = ["FRONT", "SIDE", "FULL_BODY", "EXPRESSION_SHEET", "POSE"] as const;
export type CharacterReferenceKind = (typeof CHARACTER_REFERENCE_KINDS)[number];
export const characterReferenceKindSchema = z.enum(CHARACTER_REFERENCE_KINDS);
