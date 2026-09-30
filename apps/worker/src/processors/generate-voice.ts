import { prisma } from "@channelbase/database";
import { createLogger } from "@channelbase/logger";
import { markCompleted, markFailedOrRetry, markRunning, enqueueNext } from "../lib/job-run.js";
import { publishEpisodeProgress } from "../lib/pubsub.js";
import { generateSceneVoiceAsset } from "../services/asset-generation.js";

const log = createLogger("worker:generate-voice");
const DEFAULT_VOICE_ID = "mock-narrator-warm";

export interface GenerateVoicePayload {
  jobRunId: string;
  episodeId: string;
  channelId?: string;
  assetId?: string;
}

function sceneText(scene: { narration: string | null; dialogue: unknown }): string {
  const dialogue = (scene.dialogue as Array<{ line: string }>) ?? [];
  return [scene.narration, ...dialogue.map((d) => d.line)].filter(Boolean).join(" ");
}

export async function processGenerateVoice(payload: GenerateVoicePayload): Promise<void> {
  const { jobRunId, episodeId } = payload;
  await markRunning(jobRunId, "VOICE_GENERATION");

  try {
    if (payload.assetId) {
      const asset = await prisma.asset.findUniqueOrThrow({ where: { id: payload.assetId }, include: { scene: true } });
      if (!asset.sceneId || !asset.scene) throw new Error("Asset has no associated scene to regenerate voice from.");
      await generateSceneVoiceAsset({ channelId: asset.channelId, episodeId, sceneId: asset.sceneId, text: sceneText(asset.scene), voiceId: DEFAULT_VOICE_ID });
      await markCompleted(jobRunId, { regenerated: asset.id });
      return;
    }

    const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "VOICE_GENERATION" } });
    await publishEpisodeProgress({ episodeId, status: "VOICE_GENERATION", progress: 45, message: "Recording narration and dialogue", timestamp: new Date().toISOString() });

    const scenes = await prisma.scene.findMany({ where: { episodeId }, orderBy: { sceneNumber: "asc" } });
    let generated = 0;
    for (const scene of scenes) {
      const text = sceneText(scene);
      if (!text.trim()) continue;
      await generateSceneVoiceAsset({ channelId: episode.channelId, episodeId, sceneId: scene.id, text, voiceId: DEFAULT_VOICE_ID });
      generated += 1;
    }

    log.info({ episodeId, generated }, "voice generation pass complete");
    await markCompleted(jobRunId, { generated });
    await enqueueNext("GENERATE_VIDEO", { episodeId, channelId: episode.channelId });
  } catch (err) {
    log.error({ err, episodeId }, "voice generation stage failed");
    await publishEpisodeProgress({ episodeId, status: "FAILED", progress: 0, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
    await markFailedOrRetry(jobRunId, "GENERATE_VOICE", payload as unknown as Record<string, unknown>, err);
  }
}
