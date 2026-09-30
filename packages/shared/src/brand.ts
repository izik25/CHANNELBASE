import { z } from "zod";

export const brandStyleSchema = z.object({
  primaryColors: z.array(z.string()).min(1),
  secondaryColors: z.array(z.string()).default([]),
  typography: z.string().min(1),
  logoStyle: z.string().min(1),
  illustrationStyle: z.string().min(1),
  lighting: z.string().optional(),
  backgroundStyle: z.string().optional(),
  compositionRules: z.array(z.string()).default([]),
  thumbnailRules: z.array(z.string()).default([]),
});
export type BrandStyle = z.infer<typeof brandStyleSchema>;

export const brandBibleSchema = z.object({
  brandName: z.string().min(1),
  tagline: z.string().min(1),
  brandPersonality: z.array(z.string()).default([]),
  colorDirection: z.string().min(1),
  typographyDirection: z.string().min(1),
  logoPrompt: z.string().min(1),
  avatarPrompt: z.string().min(1),
  bannerPrompt: z.string().min(1),
  thumbnailSystemDescription: z.string().min(1),
  visualRules: z.array(z.string()).default([]),
  brandRules: z.array(z.string()).default([]),
  doNotUseRules: z.array(z.string()).default([]),
  style: brandStyleSchema,
});
export type BrandBible = z.infer<typeof brandBibleSchema>;
