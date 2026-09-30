import type { ZodType, ZodTypeDef } from "zod";
import type { DirectorSpec, GenerationResult } from "@channelbase/shared";

/**
 * Every provider category the platform can call. Application code (channel-brain,
 * production, worker) MUST depend only on these interfaces — never on a
 * concrete adapter class — so a provider can be swapped by changing config,
 * not code. See docs/PROVIDERS.md for how to add a new one.
 */

export interface ProviderIdentity {
  /** Stable machine name used in routing config and DB rows, e.g. "anthropic", "mock-llm". */
  readonly name: string;
  /** Whether this is a mock/placeholder implementation — surfaced in admin UI, never to end users. */
  readonly isMock: boolean;
}

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

export interface GenerateStructuredParams<T> {
  systemPrompt?: string;
  prompt: string;
  // Input is deliberately left as `any` rather than defaulting to T: schemas with
  // `.default(...)` fields have an Input type (fields optional) that differs from their
  // Output type (defaults applied, fields required) — pinning Input=Output=T here would
  // make TS infer T from the looser Input type instead, silently turning required fields
  // optional on the returned value. See docs/ARCHITECTURE.md if this trips you up again.
  schema: ZodType<T, ZodTypeDef, any>;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateTextParams {
  systemPrompt?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AnalyzeParams {
  prompt: string;
  data: unknown;
  maxTokens?: number;
}

export interface LLMProvider extends ProviderIdentity {
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T>;
  generateText(params: GenerateTextParams): Promise<string>;
  analyze(params: AnalyzeParams): Promise<string>;
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  style?: string;
  referenceImageKeys?: string[];
  idempotencyKey: string;
}

export interface ReferenceSheetRequest {
  characterVisualPrompt: string;
  negativePrompt?: string;
  kinds: string[]; // e.g. ["FRONT", "SIDE", "FULL_BODY", "EXPRESSION_SHEET", "POSE"]
  idempotencyKey: string;
}

export interface ImageProvider extends ProviderIdentity {
  generateImage(request: ImageGenerationRequest): Promise<GenerationResult>;
  generateReferenceSheet(request: ReferenceSheetRequest): Promise<GenerationResult[]>;
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

export interface VideoGenerationRequest {
  directorSpec: DirectorSpec;
  idempotencyKey: string;
  /**
   * Storage key of an already-generated keyframe image for this scene, if one exists.
   * Image-conditioned providers (e.g. Runway, whose /image_to_video endpoint requires a
   * source image for every model variant) need this; mock/text-only providers ignore it.
   */
  referenceImageStorageKey?: string;
}

export interface ExtendVideoRequest {
  sourceStorageKey: string;
  additionalSeconds: number;
  directorSpec: DirectorSpec;
  idempotencyKey: string;
}

export interface ImageToVideoRequest {
  imageStorageKey: string;
  directorSpec: DirectorSpec;
  idempotencyKey: string;
}

export interface VideoProvider extends ProviderIdentity {
  generateVideo(request: VideoGenerationRequest): Promise<GenerationResult>;
  extendVideo(request: ExtendVideoRequest): Promise<GenerationResult>;
  imageToVideo(request: ImageToVideoRequest): Promise<GenerationResult>;
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

export interface VoiceProfile {
  voiceId: string;
  name: string;
  description?: string;
  gender?: string;
  ageRange?: string;
  sampleUrl?: string;
}

export interface GenerateSpeechRequest {
  text: string;
  voiceId: string;
  emotion?: string;
  idempotencyKey: string;
}

export interface VoiceProvider extends ProviderIdentity {
  generateSpeech(request: GenerateSpeechRequest): Promise<GenerationResult>;
  listVoices(): Promise<VoiceProfile[]>;
}

// ---------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------

export interface GenerateMusicRequest {
  style: string;
  moodDescription: string;
  durationSeconds: number;
  idempotencyKey: string;
}

export interface MusicProvider extends ProviderIdentity {
  generateMusic(request: GenerateMusicRequest): Promise<GenerationResult>;
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export interface ConnectAccountParams {
  authorizationCode: string;
  redirectUri: string;
}

export interface ConnectedAccountInfo {
  externalAccountId: string;
  channelName?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface PublishVideoParams {
  accessToken: string;
  videoStorageKey: string;
  title: string;
  description: string;
  tags: string[];
  thumbnailStorageKey?: string;
  publishAt?: Date;
}

export interface PublishResult {
  externalContentId: string;
  url?: string;
  status: "PUBLISHED" | "SCHEDULED" | "PROCESSING" | "FAILED";
}

export interface PlatformAnalyticsPoint {
  views: number;
  impressions: number;
  clickThroughRate?: number;
  watchTimeSeconds?: number;
  averageViewDuration?: number;
  retention?: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  revenueUsd: number;
  capturedAt: Date;
}

export interface PublishingProvider extends ProviderIdentity {
  readonly platform: "YOUTUBE" | "TIKTOK" | "INSTAGRAM" | "FACEBOOK";
  connectAccount(params: ConnectAccountParams): Promise<ConnectedAccountInfo>;
  publishVideo(params: PublishVideoParams): Promise<PublishResult>;
  scheduleVideo(params: PublishVideoParams & { publishAt: Date }): Promise<PublishResult>;
  uploadThumbnail(params: { accessToken: string; externalContentId: string; thumbnailStorageKey: string }): Promise<void>;
  getAnalytics(params: { accessToken: string; externalContentId: string }): Promise<PlatformAnalyticsPoint>;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface StorageUploadParams {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

export interface StorageProvider extends ProviderIdentity {
  upload(params: StorageUploadParams): Promise<{ key: string; url: string }>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  createSignedUrl(key: string, expiresSeconds?: number): Promise<string>;
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export interface BillingPlanDescriptor {
  id: string;
  name: string;
  priceUsd: number;
  creditsPerMonth: number;
}

export interface CreateCheckoutSessionParams {
  userId: string;
  userEmail: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingProvider extends ProviderIdentity {
  listPlans(): Promise<BillingPlanDescriptor[]>;
  createCheckoutSession(params: CreateCheckoutSessionParams): Promise<{ checkoutUrl: string; sessionId: string }>;
  cancelSubscription(params: { externalSubscriptionId: string }): Promise<void>;
  /** Verifies + parses a webhook payload. Returns null if the event type isn't handled. */
  parseWebhookEvent(params: { payload: string; signature: string | undefined }): Promise<
    | { type: "subscription.created" | "subscription.updated" | "subscription.canceled"; userId: string; planId: string; externalSubscriptionId: string }
    | null
  >;
}
