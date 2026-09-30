# Providers

Every external capability the platform can use — LLM, image, video, voice, music, publishing,
storage, billing — is defined as a TypeScript interface in
`packages/providers/src/interfaces.ts`. Application code (channel-brain, worker processors, API
routes) **never imports a concrete provider class** — it only ever calls `ProviderRouter` or holds
a reference typed as the interface. This is what lets a provider be swapped by changing
`.env`, not code.

## Status of each provider category

| Category | Mock | Real adapter | Notes |
|---|---|---|---|
| LLM | `mock-llm` (schema-driven fabrication, fully offline) | `anthropic` (Claude Messages API) | `openai` is a documented stub |
| Image | `mock-image` (gradient PNG placeholder, rasterized from SVG via `sharp`) | `openai` (gpt-image-1, via the official `openai` SDK) | `stability` is a documented stub |
| Video | `mock-video` (ffmpeg test-pattern clip if ffmpeg is installed, else a JSON placeholder) | `runway` (image-to-video via `/v1/image_to_video` + task polling; requires a per-scene source image, which the pipeline supplies from that scene's own generated IMAGE asset) | `luma` is a documented stub; Runway's `extendVideo` has no equivalent endpoint on their current API and throws rather than guessing |
| Voice | `mock-voice` (silent WAV sized to the text length) | `elevenlabs` (via the official `@elevenlabs/elevenlabs-js` SDK — note the older unscoped `elevenlabs` package is deprecated) | |
| Music | `mock-music` (silent WAV) | — | no adapter stub yet — no single dominant public API to target without guessing |
| Publishing | `mock-youtube` (simulates the full lifecycle) | `youtube` (YouTube Data API v3, via `googleapis`) | `tiktok`/`instagram`/`facebook` are documented stubs |
| Storage | — | `local` (disk) and `s3` (AWS S3 or any S3-compatible endpoint, e.g. MinIO) | both are "real", no mock needed |

The three newly-real adapters (OpenAI images, Runway video, ElevenLabs voice) were implemented
by reading each vendor's actual SDK source/API guide directly (not from memory) to avoid
fabricating endpoints — see the doc comment at the top of each adapter file for exactly what was
verified and when, so a future update can tell what might have drifted since.
| Billing | `mock-billing` (simulates checkout, grants credits immediately) | `stripe` | |

"Documented stub" means: the interface is implemented, the constructor/methods exist, and each
method throws `ProviderNotConfiguredError` with the exact steps to finish it — never fabricated API
behavior.

## Routing & fallback

`ProviderRouter` (`packages/providers/src/router/provider-router.ts`) takes a chain of provider
names per category and tries them in order, catching errors and falling back automatically. The
default chain (`packages/config/src/provider-routing.ts`) is `[configured provider, mock]` — so a
misconfigured or rate-limited real provider degrades to a mock generation rather than failing the
whole pipeline.

In the worker, routing is instead resolved from the `ProviderConfig` database table
(`apps/worker/src/lib/provider-router.ts`), which the admin UI can edit at runtime (enable/disable,
change priority) without a deploy. It falls back to the static `packages/config` defaults if the
table is empty.

## Adding a new provider

Example: adding a real Stability AI image adapter.

```ts
// packages/providers/src/image/stability.ts
import type { ImageProvider, ImageGenerationRequest, ReferenceSheetRequest } from "../interfaces.js";
import type { GenerationResult } from "@channelbase/shared";

export class StabilityImageProvider implements ImageProvider {
  readonly name = "stability";
  readonly isMock = false;
  constructor(private readonly apiKey: string) {}

  async generateImage(request: ImageGenerationRequest): Promise<GenerationResult> {
    // call the Stability API, upload the result via a StorageProvider, return a GenerationResult
  }

  async generateReferenceSheet(request: ReferenceSheetRequest): Promise<GenerationResult[]> {
    // call generateImage once per requested reference kind
  }
}
```

Then register it in `packages/providers/src/router/registry.ts`:

```ts
if (env.IMAGE_API_KEY && env.IMAGE_PROVIDER === "stability") {
  registry.image.set("stability", new StabilityImageProvider(env.IMAGE_API_KEY));
}
```

Add `IMAGE_PROVIDER=stability` / `IMAGE_API_KEY=` to `.env.example`, and add `"stability"` to the
`IMAGE_PROVIDER` enum in `packages/config/src/env.ts`. Nothing else in the codebase changes.

## Adding a new publishing provider

Same shape, implementing `PublishingProvider`
(`connectAccount`/`publishVideo`/`scheduleVideo`/`uploadThumbnail`/`getAnalytics`). See
`packages/providers/src/publishing/stubs.ts` for the TikTok/Instagram/Facebook skeletons and
`packages/providers/src/publishing/youtube.ts` for a fully real example. You'll also need an OAuth
connect/callback route pair in `apps/api/src/routes/platform-accounts.ts` mirroring the YouTube one.

## Mock provider design

Mocks are not "return null" stand-ins — they implement the full interface and produce
*structurally valid* output so the rest of the pipeline (Asset rows, FFmpeg composition, quality
review) exercises the real code path:

- `MockLLMProvider` walks the caller's Zod schema and fabricates plausible values per field name
  (e.g. a field named `tagline` gets a tagline-shaped string, `targetAgeMin` gets clamped to a
  sensible range) — see `packages/providers/src/llm/mock.ts`.
- `MockImageProvider` renders an SVG placeholder with the prompt text visible on it.
- `MockVoiceProvider`/`MockMusicProvider` generate real, valid, silent WAV files sized to the
  expected duration.
- `MockVideoProvider` uses ffmpeg's `lavfi` test sources to render a real short clip with the scene
  description burned in as text, *if ffmpeg is installed*; otherwise it writes a JSON manifest
  placeholder. `MediaComposer` (`packages/production`) does the same thing one level up — real
  FFmpeg composition when every input is real, a JSON manifest describing the composition
  otherwise. This is what makes "reach a READY episode with zero API keys and no ffmpeg installed"
  possible.
