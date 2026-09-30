import { prisma } from "@channelbase/database";
import { CharacterEngine } from "@channelbase/channel-brain";
import type { BrandBible, ChannelSpec } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { providerRouter } from "../lib/provider-router.js";
import { RouterBackedLLMProvider } from "../lib/llm-adapter.js";
import { markCompleted, markFailedOrRetry, markRunning } from "../lib/job-run.js";
import { generateCharacterReferenceAssets } from "../services/asset-generation.js";

const log = createLogger("worker:generate-characters");
const characterEngine = new CharacterEngine(new RouterBackedLLMProvider(providerRouter));

export interface GenerateCharactersPayload {
  jobRunId: string;
  channelId: string;
}

/** Standalone character-set regeneration/expansion — additive, does not delete existing characters. */
export async function processGenerateCharacters(payload: GenerateCharactersPayload): Promise<void> {
  const { jobRunId, channelId } = payload;
  await markRunning(jobRunId, "characters");

  try {
    const [specVersion, brandRow] = await Promise.all([
      prisma.channelSpecVersion.findFirstOrThrow({ where: { channelId }, orderBy: { version: "desc" } }),
      prisma.brandBible.findFirstOrThrow({ where: { channelId }, orderBy: { version: "desc" } }),
    ]);
    const spec = specVersion.spec as unknown as ChannelSpec;
    const brand = brandRow.data as unknown as BrandBible;

    const drafts = await characterEngine.generate(spec, brand);
    const created = [];
    for (const c of drafts) {
      const character = await prisma.character.create({
        data: {
          channelId,
          name: c.name,
          role: c.role,
          species: c.species,
          genderPresentation: c.genderPresentation,
          ageDescription: c.appearance.ageDescription,
          bodyDescription: c.appearance.bodyDescription,
          faceDescription: c.appearance.faceDescription,
          clothingDescription: c.appearance.clothingDescription,
          accessories: c.appearance.accessories,
          personality: c.personality.personality,
          strengths: c.personality.strengths,
          weaknesses: c.personality.weaknesses,
          catchphrases: c.personality.catchphrases,
          speechStyle: c.personality.speechStyle,
          visualPrompt: c.visualPrompt,
          negativePrompt: c.negativePrompt,
          consistencyRules: c.consistencyRules,
          doNotChangeRules: c.doNotChangeRules,
        },
      });
      await generateCharacterReferenceAssets({ channelId, characterId: character.id, visualPrompt: character.visualPrompt, negativePrompt: character.negativePrompt });
      created.push(character.id);
    }

    log.info({ channelId, created: created.length }, "characters regenerated/expanded");
    await markCompleted(jobRunId, { created });
  } catch (err) {
    log.error({ err, channelId }, "character regeneration failed");
    await markFailedOrRetry(jobRunId, "GENERATE_CHARACTERS", payload as unknown as Record<string, unknown>, err);
  }
}
