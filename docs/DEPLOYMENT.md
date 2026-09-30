# Deployment notes

This repository is a pnpm/Turborepo monorepo with three deployable processes plus infrastructure.
There is no deployment automation included — these are the pieces you'll need to wire up.

## Processes to deploy

| Process | Command | Notes |
|---|---|---|
| `apps/web` | `pnpm --filter @channelbase/web build && pnpm --filter @channelbase/web start` | Standard Next.js deploy (Vercel, or any Node host) |
| `apps/api` | `pnpm --filter @channelbase/api build && pnpm --filter @channelbase/api start` | Needs `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY` |
| `apps/worker` | `pnpm --filter @channelbase/worker build && pnpm --filter @channelbase/worker start` | Same env as the API; scale horizontally by running multiple instances (BullMQ handles concurrency safely) |

## Infrastructure

- **PostgreSQL** — run `pnpm --filter @channelbase/database db:deploy` (applies committed
  migrations; use `prisma migrate dev` locally to generate them first — this repo ships with
  `db:push` for rapid local iteration, but production should use real migrations).
- **Redis** — used for both BullMQ (job queue) and pub/sub (SSE progress streaming). A single
  Redis instance can serve both roles.
- **Object storage** — set `STORAGE_DRIVER=s3` with `S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`
  (works against AWS S3 or any S3-compatible provider). The `local` driver is dev-only — it writes
  to disk on whichever machine the API process runs on, which doesn't work across multiple
  instances or ephemeral containers.
- **ffmpeg** — install the `ffmpeg` binary on any host running `apps/worker` if you want real
  video composition (`packages/production`) and real mock-video test clips
  (`packages/providers/src/video/mock.ts`) instead of the JSON-manifest fallback.

## Secrets

Never commit `.env`. At minimum, rotate `JWT_SECRET` and `ENCRYPTION_KEY` away from the `.env.example`
placeholders before any non-local deployment — `ENCRYPTION_KEY` in particular is what protects
`PlatformAccount` OAuth tokens at rest (AES-256-GCM, see `apps/api/src/lib/encryption.ts`).

## Feature flags

`FEATURE_YOUTUBE_PUBLISHING`, `FEATURE_AUTOPILOT`, `FEATURE_REAL_VIDEO_GENERATION`,
`FEATURE_REAL_IMAGE_GENERATION` gate functionality that's architecturally complete but should stay
off until you've configured the corresponding real credentials (and, for `FEATURE_AUTOPILOT`,
until you've built the publishing safety review flow — the API rejects enabling it today with a
clear 403).

## Billing webhooks

If you configure `BILLING_PROVIDER=stripe`, point a Stripe webhook at
`POST /billing/webhook` on the API's public URL and set `STRIPE_WEBHOOK_SECRET`.
