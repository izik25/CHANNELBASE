import { createLogger } from "@channelbase/logger";
import type { GenerationResult } from "@channelbase/shared";
import type {
  AnalyzeParams,
  BillingProvider,
  GenerateMusicRequest,
  GenerateSpeechRequest,
  GenerateStructuredParams,
  GenerateTextParams,
  ImageGenerationRequest,
  LLMProvider,
  MusicProvider,
  PublishingProvider,
  ReferenceSheetRequest,
  StorageProvider,
  VideoProvider,
  VoiceProfile,
  VoiceProvider,
  ExtendVideoRequest,
  ImageToVideoRequest,
  VideoGenerationRequest,
  ImageProvider,
  ProviderIdentity,
} from "../interfaces.js";

const log = createLogger("provider-router");

export interface ProviderRegistry {
  llm: Map<string, LLMProvider>;
  image: Map<string, ImageProvider>;
  video: Map<string, VideoProvider>;
  voice: Map<string, VoiceProvider>;
  music: Map<string, MusicProvider>;
  publishing: Map<string, PublishingProvider>;
  storage: StorageProvider;
  billing: BillingProvider;
}

export type ChainResolver = (category: "llm" | "image" | "video" | "voice" | "music") => Promise<string[]> | string[];

export interface RoutedResult<T> {
  result: T;
  provider: string;
  attempts: { provider: string; error: string }[];
}

/**
 * The application NEVER calls a provider adapter directly — every generation
 * call goes through this router, which tries providers in priority order and
 * falls back on failure. Callers get back which provider actually served the
 * request (for GenerationRequest/UsageEvent bookkeeping) plus the list of any
 * failed attempts (for diagnostics).
 */
export class ProviderRouter {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly resolveChain: ChainResolver,
  ) {}

  get storage(): StorageProvider {
    return this.registry.storage;
  }

  get billing(): BillingProvider {
    return this.registry.billing;
  }

  /** Lists registered providers for a category — used by admin/read-only UI, never exposes credentials. */
  listProviders(category: "llm" | "image" | "video" | "voice" | "music"): ProviderIdentity[] {
    return [...this.registry[category].values()];
  }

  listPublishingProviders(): PublishingProvider[] {
    return [...this.registry.publishing.values()];
  }

  private async chainFor(category: "llm" | "image" | "video" | "voice" | "music"): Promise<string[]> {
    const chain = await this.resolveChain(category);
    if (chain.length === 0) {
      throw new Error(`No providers configured for category "${category}".`);
    }
    return chain;
  }

  private async withFallback<TProvider, TResult>(
    category: "llm" | "image" | "video" | "voice" | "music",
    providerMap: Map<string, TProvider>,
    fn: (provider: TProvider) => Promise<TResult>,
  ): Promise<RoutedResult<TResult>> {
    const chain = await this.chainFor(category);
    const attempts: { provider: string; error: string }[] = [];

    for (const providerName of chain) {
      const provider = providerMap.get(providerName);
      if (!provider) {
        attempts.push({ provider: providerName, error: "not registered" });
        continue;
      }
      try {
        const result = await fn(provider);
        if (attempts.length > 0) {
          log.warn({ category, provider: providerName, attempts }, "provider succeeded after fallback");
        }
        return { result, provider: providerName, attempts };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({ category, provider: providerName, error: message }, "provider call failed, trying next in chain");
        attempts.push({ provider: providerName, error: message });
      }
    }

    throw new Error(`All providers in the "${category}" chain failed: ${JSON.stringify(attempts)}`);
  }

  // ---- LLM ------------------------------------------------------------------

  generateText(params: GenerateTextParams): Promise<RoutedResult<string>> {
    return this.withFallback("llm", this.registry.llm, (p) => p.generateText(params));
  }

  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<RoutedResult<T>> {
    return this.withFallback("llm", this.registry.llm, (p) => p.generateStructured(params));
  }

  analyze(params: AnalyzeParams): Promise<RoutedResult<string>> {
    return this.withFallback("llm", this.registry.llm, (p) => p.analyze(params));
  }

  // ---- Image ------------------------------------------------------------------

  generateImage(request: ImageGenerationRequest): Promise<RoutedResult<GenerationResult>> {
    return this.withFallback("image", this.registry.image, (p) => p.generateImage(request));
  }

  generateReferenceSheet(request: ReferenceSheetRequest): Promise<RoutedResult<GenerationResult[]>> {
    return this.withFallback("image", this.registry.image, (p) => p.generateReferenceSheet(request));
  }

  // ---- Video ------------------------------------------------------------------

  generateVideo(request: VideoGenerationRequest): Promise<RoutedResult<GenerationResult>> {
    return this.withFallback("video", this.registry.video, (p) => p.generateVideo(request));
  }

  extendVideo(request: ExtendVideoRequest): Promise<RoutedResult<GenerationResult>> {
    return this.withFallback("video", this.registry.video, (p) => p.extendVideo(request));
  }

  imageToVideo(request: ImageToVideoRequest): Promise<RoutedResult<GenerationResult>> {
    return this.withFallback("video", this.registry.video, (p) => p.imageToVideo(request));
  }

  // ---- Voice ------------------------------------------------------------------

  generateSpeech(request: GenerateSpeechRequest): Promise<RoutedResult<GenerationResult>> {
    return this.withFallback("voice", this.registry.voice, (p) => p.generateSpeech(request));
  }

  listVoices(): Promise<RoutedResult<VoiceProfile[]>> {
    return this.withFallback("voice", this.registry.voice, (p) => p.listVoices());
  }

  // ---- Music ------------------------------------------------------------------

  generateMusic(request: GenerateMusicRequest): Promise<RoutedResult<GenerationResult>> {
    return this.withFallback("music", this.registry.music, (p) => p.generateMusic(request));
  }

  // ---- Publishing (selected by platform, not a priority chain) ---------------

  getPublishingProvider(platform: PublishingProvider["platform"], preferReal: boolean): PublishingProvider {
    const candidates = [...this.registry.publishing.values()].filter((p) => p.platform === platform);
    const real = candidates.find((p) => !p.isMock);
    const mock = candidates.find((p) => p.isMock);
    const chosen = (preferReal && real) || mock || real;
    if (!chosen) throw new Error(`No publishing provider registered for platform "${platform}".`);
    return chosen;
  }
}
