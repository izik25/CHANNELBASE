import { prisma } from "@channelbase/database";
import { PromptCompiler, UsageRecorder } from "@channelbase/ai";
import type { BrandBible, DirectorSpec } from "@channelbase/shared";
import { createLogger } from "@channelbase/logger";
import { providerRouter } from "../lib/provider-router.js";

const log = createLogger("worker:asset-generation");
const promptCompiler = new PromptCompiler();
const usageRecorder = new UsageRecorder();

async function getChannelUserId(channelId: string): Promise<string> {
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId }, select: { userId: true } });
  return channel.userId;
}

export async function generateSceneImageAsset(params: { channelId: string; episodeId: string; sceneId: string; directorSpec: DirectorSpec; brand: BrandBible }) {
  const idempotencyKey = `image:${params.sceneId}`;
  const asset = await prisma.asset.upsert({
    where: { idempotencyKey },
    update: { status: "GENERATING", error: null },
    create: { channelId: params.channelId, episodeId: params.episodeId, sceneId: params.sceneId, type: "IMAGE", status: "GENERATING", idempotencyKey },
  });

  try {
    const request = promptCompiler.compileSceneImageRequest({ directorSpec: params.directorSpec, brand: params.brand, idempotencyKey });
    const routed = await providerRouter.generateImage({ prompt: request.prompt, negativePrompt: request.negativePrompt, width: request.width, height: request.height, idempotencyKey });
    const userId = await getChannelUserId(params.channelId);
    const { costUsd } = await usageRecorder.record({ userId, channelId: params.channelId, episodeId: params.episodeId, provider: routed.provider, operation: "generateImage", generatedImages: 1 });

    return prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: routed.result.status,
        provider: routed.provider,
        storageKey: routed.result.storageKey,
        url: routed.result.url,
        width: routed.result.width,
        height: routed.result.height,
        mimeType: routed.result.mimeType,
        generationPrompt: request.prompt,
        generationMetadata: routed.result.metadata as never,
        cost: costUsd,
      },
    });
  } catch (err) {
    log.error({ err, sceneId: params.sceneId }, "scene image generation failed");
    return prisma.asset.update({ where: { id: asset.id }, data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) } });
  }
}

export async function generateSceneVideoAsset(params: { channelId: string; episodeId: string; sceneId: string; directorSpec: DirectorSpec }) {
  const idempotencyKey = `video:${params.sceneId}`;
  const asset = await prisma.asset.upsert({
    where: { idempotencyKey },
    update: { status: "GENERATING", error: null },
    create: { channelId: params.channelId, episodeId: params.episodeId, sceneId: params.sceneId, type: "VIDEO", status: "GENERATING", idempotencyKey },
  });

  try {
    // Image-conditioned real providers (e.g. Runway) need a source image per scene — the
    // pipeline always generates a scene's IMAGE asset before its VIDEO asset (see
    // processors/generate-image.ts running before processors/generate-video.ts), so it
    // should already exist here. Mock/text-only providers simply ignore this field.
    const sceneImage = await prisma.asset.findFirst({ where: { sceneId: params.sceneId, type: "IMAGE", status: "READY" }, orderBy: { createdAt: "desc" } });
    const routed = await providerRouter.generateVideo({
      directorSpec: params.directorSpec,
      idempotencyKey,
      referenceImageStorageKey: sceneImage?.storageKey ?? undefined,
    });
    const userId = await getChannelUserId(params.channelId);
    const { costUsd } = await usageRecorder.record({
      userId,
      channelId: params.channelId,
      episodeId: params.episodeId,
      provider: routed.provider,
      operation: "generateVideo",
      generatedVideoSeconds: params.directorSpec.durationSeconds,
    });

    return prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: routed.result.status,
        provider: routed.provider,
        storageKey: routed.result.storageKey,
        url: routed.result.url,
        durationSeconds: routed.result.durationSeconds,
        width: routed.result.width,
        height: routed.result.height,
        mimeType: routed.result.mimeType,
        generationPrompt: params.directorSpec.action,
        generationMetadata: routed.result.metadata as never,
        cost: costUsd,
      },
    });
  } catch (err) {
    log.error({ err, sceneId: params.sceneId }, "scene video generation failed");
    return prisma.asset.update({ where: { id: asset.id }, data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) } });
  }
}

export async function generateSceneVoiceAsset(params: { channelId: string; episodeId: string; sceneId: string; text: string; voiceId: string }) {
  const idempotencyKey = `voice:${params.sceneId}`;
  if (!params.text.trim()) return null;

  const asset = await prisma.asset.upsert({
    where: { idempotencyKey },
    update: { status: "GENERATING", error: null },
    create: { channelId: params.channelId, episodeId: params.episodeId, sceneId: params.sceneId, type: "VOICE", status: "GENERATING", idempotencyKey },
  });

  try {
    const routed = await providerRouter.generateSpeech({ text: params.text, voiceId: params.voiceId, idempotencyKey });
    const userId = await getChannelUserId(params.channelId);
    const { costUsd } = await usageRecorder.record({
      userId,
      channelId: params.channelId,
      episodeId: params.episodeId,
      provider: routed.provider,
      operation: "generateSpeech",
      generatedAudioSeconds: routed.result.durationSeconds ?? 0,
    });

    return prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: routed.result.status,
        provider: routed.provider,
        storageKey: routed.result.storageKey,
        url: routed.result.url,
        durationSeconds: routed.result.durationSeconds,
        mimeType: routed.result.mimeType,
        generationPrompt: params.text,
        generationMetadata: routed.result.metadata as never,
        cost: costUsd,
      },
    });
  } catch (err) {
    log.error({ err, sceneId: params.sceneId }, "scene voice generation failed");
    return prisma.asset.update({ where: { id: asset.id }, data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) } });
  }
}

export async function generateEpisodeMusicAsset(params: { channelId: string; episodeId: string; style: string; mood: string; durationSeconds: number }) {
  const idempotencyKey = `music:${params.episodeId}`;
  const asset = await prisma.asset.upsert({
    where: { idempotencyKey },
    update: { status: "GENERATING", error: null },
    create: { channelId: params.channelId, episodeId: params.episodeId, type: "MUSIC", status: "GENERATING", idempotencyKey },
  });

  try {
    const routed = await providerRouter.generateMusic({ style: params.style, moodDescription: params.mood, durationSeconds: params.durationSeconds, idempotencyKey });
    const userId = await getChannelUserId(params.channelId);
    const { costUsd } = await usageRecorder.record({ userId, channelId: params.channelId, episodeId: params.episodeId, provider: routed.provider, operation: "generateMusic", generatedAudioSeconds: params.durationSeconds });

    return prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: routed.result.status,
        provider: routed.provider,
        storageKey: routed.result.storageKey,
        url: routed.result.url,
        durationSeconds: routed.result.durationSeconds,
        mimeType: routed.result.mimeType,
        cost: costUsd,
      },
    });
  } catch (err) {
    log.error({ err, episodeId: params.episodeId }, "episode music generation failed");
    return prisma.asset.update({ where: { id: asset.id }, data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) } });
  }
}

export async function generateThumbnailAsset(params: { channelId: string; episodeId: string; prompt: string; negativePrompt: string; width: number; height: number }) {
  const idempotencyKey = `thumbnail:${params.episodeId}`;
  const asset = await prisma.asset.upsert({
    where: { idempotencyKey },
    update: { status: "GENERATING", error: null },
    create: { channelId: params.channelId, episodeId: params.episodeId, type: "THUMBNAIL", status: "GENERATING", idempotencyKey },
  });

  try {
    const routed = await providerRouter.generateImage({ prompt: params.prompt, negativePrompt: params.negativePrompt, width: params.width, height: params.height, idempotencyKey });
    const userId = await getChannelUserId(params.channelId);
    const { costUsd } = await usageRecorder.record({ userId, channelId: params.channelId, episodeId: params.episodeId, provider: routed.provider, operation: "generateThumbnail", generatedImages: 1 });

    return prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: routed.result.status,
        provider: routed.provider,
        storageKey: routed.result.storageKey,
        url: routed.result.url,
        width: routed.result.width,
        height: routed.result.height,
        mimeType: routed.result.mimeType,
        generationPrompt: params.prompt,
        cost: costUsd,
      },
    });
  } catch (err) {
    log.error({ err, episodeId: params.episodeId }, "thumbnail generation failed");
    return prisma.asset.update({ where: { id: asset.id }, data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) } });
  }
}

export async function generateBrandAsset(params: { channelId: string; kind: "LOGO" | "AVATAR" | "BANNER"; brand: BrandBible }) {
  const idempotencyKey = `brand-${params.kind.toLowerCase()}:${params.channelId}`;
  const asset = await prisma.asset.upsert({
    where: { idempotencyKey },
    update: { status: "GENERATING", error: null },
    create: { channelId: params.channelId, type: params.kind, status: "GENERATING", idempotencyKey },
  });

  try {
    const request = promptCompiler.compileBrandAssetRequest({ kind: params.kind, brand: params.brand, idempotencyKey });
    const routed = await providerRouter.generateImage({ prompt: request.prompt, negativePrompt: request.negativePrompt, width: request.width, height: request.height, idempotencyKey });
    const userId = await getChannelUserId(params.channelId);
    const { costUsd } = await usageRecorder.record({ userId, channelId: params.channelId, provider: routed.provider, operation: `generate${params.kind}`, generatedImages: 1 });

    return prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: routed.result.status,
        provider: routed.provider,
        storageKey: routed.result.storageKey,
        url: routed.result.url,
        width: routed.result.width,
        height: routed.result.height,
        mimeType: routed.result.mimeType,
        generationPrompt: request.prompt,
        cost: costUsd,
      },
    });
  } catch (err) {
    log.error({ err, channelId: params.channelId, kind: params.kind }, "brand asset generation failed");
    return prisma.asset.update({ where: { id: asset.id }, data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) } });
  }
}

export async function generateCharacterReferenceAssets(params: { channelId: string; characterId: string; visualPrompt: string; negativePrompt: string }) {
  const idempotencyKey = `char-refs:${params.characterId}`;
  const kinds = ["FRONT", "SIDE", "FULL_BODY", "EXPRESSION_SHEET"] as const;

  const routed = await providerRouter.generateReferenceSheet({ characterVisualPrompt: params.visualPrompt, negativePrompt: params.negativePrompt, kinds: [...kinds], idempotencyKey });
  const userId = await getChannelUserId(params.channelId);
  await usageRecorder.record({ userId, channelId: params.channelId, provider: routed.provider, operation: "generateReferenceSheet", generatedImages: kinds.length });

  const created = [];
  for (let i = 0; i < kinds.length; i++) {
    const result = routed.result[i];
    if (!result) continue;
    const asset = await prisma.asset.create({
      data: {
        channelId: params.channelId,
        characterId: params.characterId,
        type: "IMAGE",
        status: result.status,
        provider: routed.provider,
        storageKey: result.storageKey,
        url: result.url,
        width: result.width,
        height: result.height,
        mimeType: result.mimeType,
        idempotencyKey: `${idempotencyKey}-${kinds[i]!.toLowerCase()}`,
        cost: result.costUsd,
      },
    });
    await prisma.characterReference.create({ data: { characterId: params.characterId, kind: kinds[i]!, assetId: asset.id } });
    created.push(asset);
  }
  return created;
}
