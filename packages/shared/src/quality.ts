import { z } from "zod";
import { qualityRiskCategorySchema } from "./enums.js";

export const qualityCheckSchema = z.object({
  key: z.enum([
    "storySimilarity",
    "visualRepetition",
    "scriptRepetition",
    "hookRepetition",
    "characterConsistency",
    "brandConsistency",
    "continuityConsistency",
    "missingAssets",
    "audioQuality",
    "durationCompliance",
  ]),
  score: z.number().min(0).max(100),
  explanation: z.string(),
});
export type QualityCheck = z.infer<typeof qualityCheckSchema>;

export const qualityReviewResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  checks: z.array(qualityCheckSchema),
  riskCategories: z.array(qualityRiskCategorySchema).default([]),
  notes: z.string().optional(),
});
export type QualityReviewResult = z.infer<typeof qualityReviewResultSchema>;
