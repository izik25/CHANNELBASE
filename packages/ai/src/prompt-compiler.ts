import type { BrandBible, CharacterDraft, DirectorSpec, GenerationRequest, LocationDraft, ThumbnailSpec } from "@channelbase/shared";

/**
 * Turns provider-agnostic structured context (ChannelSpec/BrandBible/
 * CharacterBible/WorldBible/DirectorSpec) into a GenerationRequest — the
 * last provider-agnostic shape in the pipeline. Nothing here knows about any
 * specific image/video/voice model's prompt syntax; that translation is the
 * provider adapter's job (packages/providers). This class only knows how to
 * merge brand/character/world consistency rules into coherent prompt text.
 */
export class PromptCompiler {
  compileCharacterVisualPrompt(character: Pick<CharacterDraft, "visualPrompt" | "consistencyRules">, brand: BrandBible): string {
    const rules = character.consistencyRules.length ? ` Consistency rules: ${character.consistencyRules.join("; ")}.` : "";
    return `${character.visualPrompt} Rendered in the channel's established style: ${brand.style.illustrationStyle}, ${brand.style.lighting ?? "balanced lighting"}.${rules}`;
  }

  compileLocationVisualPrompt(location: Pick<LocationDraft, "visualPrompt">, brand: BrandBible): string {
    return `${location.visualPrompt} Consistent with brand background style: ${brand.style.backgroundStyle ?? brand.style.illustrationStyle}.`;
  }

  compileSceneImageRequest(params: {
    directorSpec: DirectorSpec;
    brand: BrandBible;
    idempotencyKey: string;
  }): GenerationRequest {
    const { directorSpec: d, brand, idempotencyKey } = params;
    const characterFragments = d.characters.map((c) => `${c.name}: ${c.visualPrompt}`).join(". ");
    const locationFragment = d.location ? `Setting: ${d.location.visualPrompt}.` : "";
    const prompt = [
      `${d.visualStyle}, ${brand.style.illustrationStyle}.`,
      characterFragments,
      locationFragment,
      `Action: ${d.action}.`,
      `Camera: ${d.camera.shotType} shot, ${d.camera.movement} movement, ${d.camera.framing} framing.`,
      `Lighting: ${d.lighting}. Mood: ${d.mood}.`,
      ...brand.style.compositionRules,
    ]
      .filter(Boolean)
      .join(" ");

    const negativePrompt = [
      ...d.negativeInstructions,
      ...d.characters.map((c) => c.negativePrompt).filter(Boolean),
      d.location?.negativePrompt ?? "",
      ...brand.doNotUseRules,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      assetType: "IMAGE",
      prompt,
      negativePrompt,
      referenceImageKeys: [],
      style: brand.style.illustrationStyle,
      width: 1920,
      height: 1080,
      metadata: { sceneId: d.sceneId, shotId: d.shotId },
      idempotencyKey,
    };
  }

  compileSceneVideoRequest(params: { directorSpec: DirectorSpec; brand: BrandBible; idempotencyKey: string }): GenerationRequest {
    const { directorSpec: d, brand, idempotencyKey } = params;
    const prompt = [
      `${d.visualStyle}, ${brand.style.illustrationStyle}.`,
      `Action: ${d.action}.`,
      `Camera: ${d.camera.shotType}, ${d.camera.movement}.`,
      `Mood: ${d.mood}. Transition out: ${d.transition}.`,
      d.continuityConstraints.length ? `Continuity: ${d.continuityConstraints.join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      assetType: "VIDEO",
      prompt,
      negativePrompt: d.negativeInstructions.join(", "),
      referenceImageKeys: [],
      style: brand.style.illustrationStyle,
      durationSeconds: d.durationSeconds,
      metadata: { sceneId: d.sceneId, shotId: d.shotId, directorSpec: d },
      idempotencyKey,
    };
  }

  compileVoiceRequest(params: { text: string; voiceId: string; emotion?: string; idempotencyKey: string }): GenerationRequest {
    return {
      assetType: "VOICE",
      prompt: params.text,
      text: params.text,
      voiceId: params.voiceId,
      negativePrompt: "",
      referenceImageKeys: [],
      metadata: { emotion: params.emotion },
      idempotencyKey: params.idempotencyKey,
    };
  }

  compileThumbnailRequest(params: { spec: ThumbnailSpec; brand: BrandBible; idempotencyKey: string }): GenerationRequest {
    const { spec, brand, idempotencyKey } = params;
    const prompt = [
      `YouTube thumbnail, ${brand.style.illustrationStyle}.`,
      `Headline text: "${spec.headline}".`,
      spec.characterNames.length ? `Featuring: ${spec.characterNames.join(", ")}.` : "",
      `Emotion: ${spec.emotion}. Scene: ${spec.scene}.`,
      `Composition: ${spec.composition}. Background: ${spec.background}.`,
      `Visual hook: ${spec.visualHook}.`,
      ...brand.style.thumbnailRules,
      ...spec.brandRules,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      assetType: "THUMBNAIL",
      prompt,
      negativePrompt: brand.doNotUseRules.join(", "),
      referenceImageKeys: [],
      style: brand.style.illustrationStyle,
      width: 1280,
      height: 720,
      metadata: { textPlacement: spec.textPlacement },
      idempotencyKey,
    };
  }

  compileBrandAssetRequest(params: { kind: "LOGO" | "AVATAR" | "BANNER"; brand: BrandBible; idempotencyKey: string }): GenerationRequest {
    const { kind, brand, idempotencyKey } = params;
    const promptByKind: Record<typeof kind, string> = {
      LOGO: brand.logoPrompt,
      AVATAR: brand.avatarPrompt,
      BANNER: brand.bannerPrompt,
    };
    const dimensionsByKind: Record<typeof kind, { width: number; height: number }> = {
      LOGO: { width: 512, height: 512 },
      AVATAR: { width: 800, height: 800 },
      BANNER: { width: 2560, height: 1440 },
    };
    return {
      assetType: kind,
      prompt: `${promptByKind[kind]} Style: ${brand.style.illustrationStyle}. Colors: ${brand.style.primaryColors.join(", ")}.`,
      negativePrompt: brand.doNotUseRules.join(", "),
      referenceImageKeys: [],
      style: brand.style.illustrationStyle,
      ...dimensionsByKind[kind],
      metadata: {},
      idempotencyKey,
    };
  }
}
