import { z } from "zod";

export const storyBibleSchema = z.object({
  premise: z.string().min(1),
  coreThemes: z.array(z.string()).default([]),
  educationalObjectives: z.array(z.string()).default([]),
  characterRelationships: z.array(
    z.object({
      characterAName: z.string(),
      characterBName: z.string(),
      relationship: z.string(),
    }),
  ).default([]),
  worldRules: z.array(z.string()).default([]),
  recurringStoryElements: z.array(z.string()).default([]),
  forbiddenStoryElements: z.array(z.string()).default([]),
  continuityNotes: z.array(z.string()).default([]),
});
export type StoryBible = z.infer<typeof storyBibleSchema>;
