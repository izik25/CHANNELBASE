import { z } from "zod";
import { assetTypeSchema } from "./enums.js";

/**
 * Output of the PromptCompiler (packages/ai). This is what gets handed to a
 * ProviderRouter method; provider adapters translate it further into their
 * own wire format. Keeping this provider-agnostic is what lets a provider be
 * swapped without touching application code.
 */
export const generationRequestSchema = z.object({
  assetType: assetTypeSchema,
  prompt: z.string().min(1),
  negativePrompt: z.string().default(""),
  referenceImageKeys: z.array(z.string()).default([]),
  style: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
  voiceId: z.string().optional(),
  text: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string(),
});
export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export const generationResultSchema = z.object({
  status: z.enum(["READY", "FAILED", "GENERATING"]),
  storageKey: z.string().optional(),
  url: z.string().optional(),
  durationSeconds: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  mimeType: z.string().optional(),
  providerJobId: z.string().optional(),
  error: z.string().optional(),
  costUsd: z.number().default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type GenerationResult = z.infer<typeof generationResultSchema>;
