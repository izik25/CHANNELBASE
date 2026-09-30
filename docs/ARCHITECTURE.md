# Architecture

## High-level flow

```
USER
 │  "Create a kids channel about two funny animals exploring space"
 ▼
WEB APP (apps/web)                     — never shows models/prompts/tokens
 │  POST /channels { prompt }
 │  POST /channels/:id/build
 ▼
API (apps/api, Fastify)
 │  creates JobRun(CREATE_CHANNEL), enqueues to BullMQ
 ▼
WORKER (apps/worker)
 │  processors/create-channel.ts — the Channel Orchestrator for channel creation
 ▼
CHANNEL BRAIN (packages/channel-brain)
 │  ChannelBrain → ChannelSpec
 │  BrandEngine → BrandBible
 │  CharacterEngine → Character[]        WorldEngine → World[]/Location[]
 │  StoryBibleEngine → StoryBible        ContentPlanEngine → ContentPlan/ContentPlanItem[]
 ▼
PROVIDER ROUTER (packages/providers)     — every LLM/image/video/voice/music call goes through here
 │  tries providers in priority order, falls back automatically, never called directly by app code
 ▼
AI PROVIDERS (real adapters + mocks)     — Anthropic real; image/video/voice real-adapter skeletons; all mocked by default
 ▼
ASSET STORAGE (StorageProvider: local disk in dev, S3-compatible in prod)
 ▼
PRODUCTION PIPELINE (apps/worker/processors/*, packages/production)
 │  GENERATE_SCRIPT → BREAKDOWN_EPISODE → GENERATE_IMAGE → GENERATE_VOICE → GENERATE_VIDEO
 │  → GENERATE_MUSIC → ASSEMBLE_VIDEO (FFmpeg or dev-safe mock manifest) → GENERATE_THUMBNAIL
 │  → GENERATE_METADATA (+ QualityEngine review) → Episode.status = READY
 ▼
PUBLISHING ENGINE (packages/providers/publishing, apps/worker/processors/publish-video.ts)
 │  YouTube real adapter behind FEATURE_YOUTUBE_PUBLISHING; mock otherwise
 ▼
FINAL CONTENT — visible in the web app's Content/Assets/Episode screens
```

## Why a job queue + a durable JobRun table

BullMQ (backed by Redis) drives *execution* — retries, concurrency, delayed retries. But BullMQ is
not queryable the way the product needs ("show me this channel's build progress", "list failed
jobs in admin", "retry this specific job"). Every job type also writes a `JobRun` row in Postgres
(`packages/database`) that the API and admin UI actually read from. If Redis is flushed, the
`JobRun` history survives; if you need to audit *why* something failed, it's a normal SQL row, not
a log line that scrolled off.

## Why the ChannelSpec / DirectorSpec layering

Two deliberate translation boundaries keep the system provider-agnostic:

1. **ChannelSpec** (`packages/shared/src/channel-spec.ts`) is the *only* structured representation
   of "what the user asked for". The Channel Brain produces it once from the raw prompt; every
   other engine reads the ChannelSpec, never the original prompt again.
2. **DirectorSpec** (`packages/shared/src/director-spec.ts`) is the *only* structured representation
   of "what should this scene look/sound like". `DirectorEngine` compiles a script Scene + resolved
   Character/Location visual prompts into a DirectorSpec. `PromptCompiler`
   (`packages/ai/src/prompt-compiler.ts`) then turns a DirectorSpec + BrandBible into the actual
   prompt text (`GenerationRequest`) that gets sent to a provider adapter. **Only provider adapters
   in `packages/providers` are allowed to know a specific model's prompt syntax.**

This means swapping `IMAGE_PROVIDER=mock` for `IMAGE_PROVIDER=openai` (once
`packages/providers/src/image/openai.ts` is implemented) requires zero changes to channel-brain,
the worker processors, or the web app.

## Package boundaries

| Package | Owns | Must not depend on |
|---|---|---|
| `packages/shared` | Zod schemas/types, enums | anything else in the repo |
| `packages/config` | env validation, feature flags, static provider routing | database, providers |
| `packages/logger` | structured logging + secret redaction | everything else |
| `packages/database` | Prisma schema + client | providers, channel-brain, ai |
| `packages/providers` | provider interfaces, mocks, real adapters, ProviderRouter, StorageProvider | database, channel-brain |
| `packages/ai` | PromptCompiler, cost estimation, credit ledger | channel-brain |
| `packages/channel-brain` | LLM-driven generation engines (business logic, no I/O beyond the injected LLMProvider) | providers *adapters* (only the `LLMProvider` interface), database |
| `packages/production` | FFmpeg command builders + MediaComposer | channel-brain |
| `apps/api` | HTTP/SSE surface, auth, ownership checks | worker internals |
| `apps/worker` | job processors, orchestration, ties every package together | api internals |
| `apps/web` | UI only, talks to the API over HTTP/SSE | every backend package directly |

`apps/worker` is intentionally the "everything meets here" layer — it's where `ChannelBrain`,
`ProviderRouter`, `PromptCompiler`, `MediaComposer`, and Prisma are all wired together per job.
