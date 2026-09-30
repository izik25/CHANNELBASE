import { z } from "zod";
import { contentTypeSchema } from "./enums.js";

export const contentPlanItemSchema = z.object({
  titleIdea: z.string().min(1),
  concept: z.string().min(1),
  contentPillar: z.string().min(1),
  series: z.string().optional(),
  format: contentTypeSchema,
  targetDurationSeconds: z.number().int().positive(),
  hook: z.string().min(1),
  educationalGoal: z.string().optional(),
  emotionalGoal: z.string().optional(),
  targetPublishDate: z.string(), // ISO date
  priority: z.number().int().min(1).max(5).default(3),
});
export type ContentPlanItem = z.infer<typeof contentPlanItemSchema>;

export const contentPlanDraftSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  items: z.array(contentPlanItemSchema).min(1),
});
export type ContentPlanDraft = z.infer<typeof contentPlanDraftSchema>;
