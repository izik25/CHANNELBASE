import { z } from "zod";

export const locationDraftSchema = z.object({
  name: z.string().min(1),
  environmentDescription: z.string().min(1),
  architecture: z.string().optional(),
  lighting: z.string().min(1),
  colorPalette: z.array(z.string()).default([]),
  weather: z.string().optional(),
  timeOfDayRules: z.string().optional(),
  importantObjects: z.array(z.string()).default([]),
  visualPrompt: z.string().min(1),
  negativePrompt: z.string().default(""),
});
export type LocationDraft = z.infer<typeof locationDraftSchema>;

export const worldDraftSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  rules: z.array(z.string()).default([]),
  locations: z.array(locationDraftSchema).default([]),
});
export type WorldDraft = z.infer<typeof worldDraftSchema>;

export const recurringObjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  visualPrompt: z.string().min(1),
});
export type RecurringObject = z.infer<typeof recurringObjectSchema>;
