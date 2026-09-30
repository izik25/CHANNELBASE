# ChannelBase — Autonomous AI Channel Builder

ChannelBase turns one sentence — *"Create an English YouTube channel for kids aged 4–7 about two
funny animals exploring science and space"* — into a full Channel Operating System: brand,
characters, world bible, a 30-day content calendar, scripted episodes, generated scenes, a
composed final video, thumbnail, metadata, and (architecturally) publishing to YouTube and beyond.

It is a real, running SaaS foundation, not a mockup. Every AI provider is optional: with zero API
keys configured, the entire pipeline — from "describe your channel" to a `READY` episode with
assembled media — runs end-to-end against clearly-labeled **mock providers** that implement the
exact same interfaces real providers do.

## Product overview

- **Channel Brain** — converts a natural-language prompt into a structured, versioned `ChannelSpec`.
- **Brand / Character / World / Story engines** — generate a full brand identity, a character bible
  with reference art, a world bible with consistent locations, and the narrative rules that keep
  future episodes coherent.
- **Content Engine** — a 30-day content calendar, broken into episodes/scenes/shots.
- **AI Director** — compiles each scene into a provider-agnostic `DirectorSpec`.
- **Provider Router** — routes every generation call through a priority chain with automatic
  fallback; no application code ever imports a concrete provider class.
- **Production pipeline** — script → scene breakdown → image/voice/video generation → FFmpeg
  composition → thumbnail → metadata → automated quality review → `READY`.
- **Cost & Credits** — every provider call is metered into `UsageEvent` rows and charged against a
  credit wallet, even when every provider is a $0 mock.
- **Publishing architecture** — a complete `PublishingProvider` interface with a real YouTube Data
  API v3 adapter, a mock adapter used until credentials are configured, and documented stubs for
  TikTok/Instagram/Facebook.

The user never sees a model name, a prompt, a token count, or a render queue. They see: channel,
characters, episodes, content, brand, publishing.

## Architecture

```
apps/web        Next.js 15 + Tailwind + a small shadcn-style UI kit
apps/api        Fastify REST API + SSE progress streams
apps/worker     BullMQ consumer — every generation/production job runs here

packages/database       Prisma schema + client (single source of truth for all state)
packages/shared         Zod schemas + types shared by every app/package (ChannelSpec, DirectorSpec, ...)
packages/config         Env validation, feature flags, static provider-routing defaults
packages/logger         Structured Pino logging with secret redaction
packages/providers       Provider interfaces + mock implementations + real adapters + ProviderRouter
packages/ai             PromptCompiler, cost estimation, credit ledger, usage recording
packages/channel-brain   All LLM-driven generation engines (brand, characters, world, script, ...)
packages/production      FFmpeg command builders + MediaComposer (with a dev-safe mock fallback)
```

See `docs/ARCHITECTURE.md` for the full request → job → provider → asset data flow.

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres + Redis + MinIO
pnpm infra:up

# 3. Configure environment (safe to leave every *_API_KEY blank — mocks take over)
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local

# 4. Create the database schema and seed a demo channel
pnpm db:push
pnpm db:seed

# 5. Run everything
pnpm dev
```

- Web: http://localhost:3000 — log in with `demo@channelbase.dev` / `password123`
  (or `admin@channelbase.dev` / `password123` for `/admin`)
- API: http://localhost:4000/health
- The seed script creates a fully-populated demo channel ("Nova & Pip's Cosmic Backyard") so the
  product is visually testable immediately, even before building your own channel.

To try the full build flow yourself: log in, paste a channel idea into the dashboard, click **Build
Channel**, and watch the realtime progress stream through Understanding → Brand → Characters →
Content Planning → Ready. Then open an episode and click **Start production** to watch it move
through scripting, scene breakdown, asset generation, assembly, and quality review to `READY`.

## Environment

Every variable is documented in `.env.example`. The only ones you truly need locally are
`DATABASE_URL` and `REDIS_URL` (both already pointed at the `docker-compose.yml` services). Every
`*_PROVIDER` variable defaults to `mock`; setting `LLM_PROVIDER=anthropic` + `LLM_API_KEY` swaps in
real Claude generations everywhere the Channel Brain runs, with no code changes.

`apps/web` reads `NEXT_PUBLIC_API_URL` from its own `.env.local` (Next.js doesn't read the
monorepo-root `.env`) — copy `apps/web/.env.local.example`.

## Running locally

`pnpm dev` runs `apps/web`, `apps/api`, and `apps/worker` in parallel via Turborepo. Each can also
be run individually with `pnpm --filter @channelbase/api dev`, etc.

## Database

PostgreSQL via Prisma. See `docs/DATABASE.md` for the entity map. Common commands:

```bash
pnpm db:push      # sync schema.prisma to the database (dev)
pnpm db:migrate    # create a real migration
pnpm db:seed       # (re)seed demo data
pnpm db:studio     # open Prisma Studio
```

## Workers & jobs

BullMQ drives execution; `JobRun` rows in Postgres are the actual source of truth for status,
progress, retries, and errors — the queue can be flushed and the system stays consistent. See
`docs/PRODUCTION_PIPELINE.md` for the full job chain and retry/idempotency behavior.

## Providers

Every external AI/publishing/billing/storage capability is an interface in
`packages/providers/src/interfaces.ts` with a mock implementation and, where a well-documented
public API exists, a real adapter. See `docs/PROVIDERS.md`, including **how to add a new
provider** in about 30 lines of code.

## Adding a new AI provider

1. Implement the relevant interface (e.g. `ImageProvider`) in `packages/providers/src/image/your-provider.ts`.
2. Register it in `packages/providers/src/router/registry.ts` behind an env var check.
3. Add the env vars to `.env.example`.
4. Nothing else changes — the Channel Brain, worker processors, and ProviderRouter already only
   depend on the interface.

## Adding a new publishing provider

Same shape: implement `PublishingProvider` (see `packages/providers/src/publishing/stubs.ts` for
the documented TODO skeletons for TikTok/Instagram/Facebook), register it, and add OAuth routes in
`apps/api/src/routes/platform-accounts.ts` mirroring the YouTube flow.

## Production pipeline

See `docs/PRODUCTION_PIPELINE.md`.

## Deployment

See `docs/DEPLOYMENT.md`.

## Testing

```bash
pnpm test
```

Unit tests cover `ChannelSpec` validation, `ProviderRouter` fallback behavior, cost estimation, the
Quality Engine's scoring/risk derivation, and API permission helpers — all runnable offline with no
database or API keys. Full integration testing (real DB writes, the complete channel-build job)
requires `pnpm infra:up` and is exercised by actually running the app (see Quick start).
