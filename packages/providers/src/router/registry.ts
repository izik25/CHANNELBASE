import { env, getDefaultProviderRouting } from "@channelbase/config";
import { createLogger } from "@channelbase/logger";
import { AnthropicLLMProvider } from "../llm/anthropic.js";
import { MockLLMProvider } from "../llm/mock.js";
import { OpenAILLMProvider } from "../llm/openai.js";
import { MockImageProvider } from "../image/mock.js";
import { OpenAIImageProvider } from "../image/openai.js";
import { MockVideoProvider } from "../video/mock.js";
import { RunwayVideoProvider } from "../video/runway.js";
import { MockVoiceProvider } from "../voice/mock.js";
import { ElevenLabsVoiceProvider } from "../voice/elevenlabs.js";
import { MockMusicProvider } from "../music/mock.js";
import { MockYouTubePublishingProvider } from "../publishing/mock-youtube.js";
import { YouTubePublishingProvider } from "../publishing/youtube.js";
import { FacebookPublishingProvider, InstagramPublishingProvider, TikTokPublishingProvider } from "../publishing/stubs.js";
import { MockBillingProvider } from "../billing/mock.js";
import { StripeBillingProvider } from "../billing/stripe.js";
import { createStorageProvider } from "../storage/factory.js";
import type { StorageProvider } from "../interfaces.js";
import { ProviderRouter, type ChainResolver, type ProviderRegistry } from "./provider-router.js";

const log = createLogger("provider-registry");

/**
 * Builds every provider adapter this deployment can use. Real adapters are
 * only registered when their credentials are present; mocks are always
 * registered so a chain can always fall back to one. This is the single
 * place that knows every concrete provider class — everything else only
 * ever touches the ProviderRouter / interfaces.
 */
export function buildProviderRegistry(storage: StorageProvider = createStorageProvider()): ProviderRegistry {
  const registry: ProviderRegistry = {
    llm: new Map(),
    image: new Map(),
    video: new Map(),
    voice: new Map(),
    music: new Map(),
    publishing: new Map(),
    storage,
    billing:
      env.BILLING_PROVIDER === "stripe" && env.STRIPE_SECRET_KEY
        ? new StripeBillingProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET)
        : new MockBillingProvider(),
  };

  // LLM
  registry.llm.set("mock-llm", new MockLLMProvider());
  if (env.LLM_API_KEY) {
    try {
      if (env.LLM_PROVIDER === "anthropic") registry.llm.set("anthropic", new AnthropicLLMProvider(env.LLM_API_KEY, env.LLM_MODEL));
      if (env.LLM_PROVIDER === "openai") registry.llm.set("openai", new OpenAILLMProvider(env.LLM_API_KEY));
    } catch (err) {
      log.warn({ err }, "failed to construct configured LLM provider, falling back to mock only");
    }
  }

  // Image
  registry.image.set("mock-image", new MockImageProvider(storage));
  if (env.IMAGE_API_KEY && env.IMAGE_PROVIDER === "openai") {
    try {
      registry.image.set("openai", new OpenAIImageProvider(env.IMAGE_API_KEY, storage, env.IMAGE_MODEL));
    } catch (err) {
      log.warn({ err }, "failed to construct OpenAI image provider, falling back to mock-image only");
    }
  }

  // Video
  registry.video.set("mock-video", new MockVideoProvider(storage));
  if (env.VIDEO_API_KEY && env.VIDEO_PROVIDER === "runway") {
    try {
      registry.video.set("runway", new RunwayVideoProvider(env.VIDEO_API_KEY, storage, env.VIDEO_MODEL));
    } catch (err) {
      log.warn({ err }, "failed to construct Runway video provider, falling back to mock-video only");
    }
  }

  // Voice
  registry.voice.set("mock-voice", new MockVoiceProvider(storage));
  if (env.VOICE_API_KEY && env.VOICE_PROVIDER === "elevenlabs") {
    try {
      registry.voice.set("elevenlabs", new ElevenLabsVoiceProvider(env.VOICE_API_KEY, storage, env.VOICE_MODEL));
    } catch (err) {
      log.warn({ err }, "failed to construct ElevenLabs voice provider, falling back to mock-voice only");
    }
  }

  // Music
  registry.music.set("mock-music", new MockMusicProvider(storage));

  // Publishing
  registry.publishing.set("mock-youtube", new MockYouTubePublishingProvider());
  registry.publishing.set("tiktok", new TikTokPublishingProvider());
  registry.publishing.set("instagram", new InstagramPublishingProvider());
  registry.publishing.set("facebook", new FacebookPublishingProvider());
  if (env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET) {
    try {
      registry.publishing.set(
        "youtube",
        new YouTubePublishingProvider(env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET, env.YOUTUBE_REDIRECT_URI ?? "", storage),
      );
    } catch (err) {
      log.warn({ err }, "failed to construct YouTube provider, publishing will use mock-youtube");
    }
  }

  return registry;
}

/** Default chain resolver — static config from packages/config. Pass a DB-backed resolver from apps/api|worker to allow admin overrides. */
export function defaultChainResolver(): ChainResolver {
  const routes = getDefaultProviderRouting();
  return (category) => {
    const route = routes.find((r) => r.category === category);
    return route?.chain ?? [];
  };
}

export function createDefaultProviderRouter(storage?: StorageProvider): ProviderRouter {
  return new ProviderRouter(buildProviderRegistry(storage), defaultChainResolver());
}
