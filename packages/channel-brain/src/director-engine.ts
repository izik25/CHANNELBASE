import type { CharacterDraft, DirectorSpec, LocationDraft, SceneDraft } from "@channelbase/shared";

/**
 * Deterministically compiles a script Scene into a DirectorSpec by resolving
 * character/location names into their full visual prompts and folding in
 * continuity/consistency rules. No LLM call needed here — everything the
 * DirectorSpec requires already exists on the Scene plus the Character/
 * Location Bibles; this is a pure translation step, kept as its own engine
 * so scene→DirectorSpec compilation has one obvious place to evolve (e.g.
 * later inferring camera choices with an LLM) without touching callers.
 */
export class DirectorEngine {
  compileScene(params: {
    scene: SceneDraft;
    sceneId: string;
    shotId?: string;
    characters: Array<Pick<CharacterDraft, "name" | "visualPrompt" | "negativePrompt"> & { id: string }>;
    location?: (Pick<LocationDraft, "name" | "visualPrompt" | "negativePrompt"> & { id: string }) | undefined;
    visualStyle: string;
    globalNegativeInstructions?: string[];
    continuityConstraints?: string[];
  }): DirectorSpec {
    const { scene } = params;
    const sceneCharacters = params.characters.filter((c) => scene.characterNames.includes(c.name));

    return {
      sceneId: params.sceneId,
      shotId: params.shotId,
      durationSeconds: scene.durationEstimateSeconds,
      characters: sceneCharacters.map((c) => ({
        characterId: c.id,
        name: c.name,
        visualPrompt: c.visualPrompt,
        negativePrompt: c.negativePrompt,
      })),
      location: params.location
        ? {
            locationId: params.location.id,
            name: params.location.name,
            visualPrompt: params.location.visualPrompt,
            negativePrompt: params.location.negativePrompt,
          }
        : undefined,
      action: scene.action,
      camera: inferCamera(scene),
      lighting: params.location ? "consistent with location lighting" : "natural, soft",
      mood: scene.emotion,
      visualStyle: params.visualStyle,
      dialogue: scene.dialogue,
      narration: scene.narration,
      emotion: scene.emotion,
      soundEffects: [],
      musicDirection: undefined,
      transition: scene.transition,
      continuityConstraints: [scene.continuityNotes, ...(params.continuityConstraints ?? [])].filter((v): v is string => Boolean(v)),
      negativeInstructions: params.globalNegativeInstructions ?? [],
    };
  }
}

function inferCamera(scene: SceneDraft): DirectorSpec["camera"] {
  const isDialogueHeavy = scene.dialogue.length >= 2;
  return {
    shotType: isDialogueHeavy ? "medium" : "wide",
    movement: scene.durationEstimateSeconds > 20 ? "slow-pan" : "static",
    framing: "centered",
  };
}
