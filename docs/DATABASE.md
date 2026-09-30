# Database

PostgreSQL via Prisma (`packages/database/prisma/schema.prisma`). Every entity described in the
product spec is a real table with real relations and indexes — nothing is stored as an untyped
blob except the JSON fields explicitly noted below (which hold data whose *shape* is owned by a
`packages/shared` Zod schema, not the database).

## Entity map

```
User ──< Session
User ──< Channel ──< ChannelSpecVersion   (versioned, immutable — baseline + edits)
                 ├──< BrandBible          (versioned)
                 ├──< StoryBible          (versioned)
                 ├──< Character ──< CharacterReference ──> Asset
                 ├──< World ──< Location
                 ├──< ContentPlan ──< ContentPlanItem ──> Episode (1:1 once produced)
                 ├──< Series ──< Episode
                 ├──< Episode ──< Scene ──< Shot
                 │            ├──< SceneCharacter >── Character (join table)
                 │            ├──< Asset
                 │            ├──< QualityReview
                 │            └──< PublishedContent ──< AnalyticsSnapshot
                 ├──< Asset (channel-level: logo/avatar/banner)
                 ├──< PlatformAccount ──< PublishedContent
                 ├──< ChannelInsight
                 ├──< UsageEvent
                 └──< JobRun ──< GenerationRequest

User ──< PlatformAccount
User ──< Subscription ──> Plan
User ──1 CreditWallet ──< CreditTransaction
User ──< UsageEvent
User ──< AuditLog

ProviderConfig            (admin-editable routing, not tied to a channel)
```

## Why some fields are JSON

`ChannelSpecVersion.spec`, `BrandBible.data`, `StoryBible.data`, `Character.personality` (and
siblings), `Scene.dialogue`, `Scene.directorSpec`, `Shot.directorSpec`, `Episode.script`,
`Episode.metadata`, `Asset.generationMetadata`, `QualityReview.checks` — these all store data whose
canonical shape is a Zod schema in `packages/shared`, not a column-per-field table. This keeps the
generation engines (which produce these values) decoupled from migrations: adding a field to
`BrandStyle` doesn't require a Prisma migration, just a schema + engine change. Anything queried,
filtered, or joined on (status, type, dates, foreign keys) is a real typed column.

## Versioning

`ChannelSpecVersion`, `BrandBible`, and `StoryBible` all use a `(channelId, version)` unique
constraint instead of an updatable single row — history is never overwritten. The "current" version
is always `orderBy: { version: "desc" }, take: 1`.

## Soft delete

`User`, `Channel`, `Character`, and `Episode` have a nullable `deletedAt` — application queries
filter `deletedAt: null`. Nothing is hard-deleted except `Session`, `PlatformAccount`, and
`Asset` regeneration replacements, which have no audit value once gone.

## Idempotency

- `Asset.idempotencyKey` is unique — every generation call derives a deterministic key (e.g.
  `image:${sceneId}`, `final:${episodeId}`) so retried jobs `upsert` onto the same Asset row instead
  of creating duplicates.
- `JobRun.idempotencyKey` is unique — used for the channel-build trigger (`create-channel:${channelId}`)
  so a duplicate "Build Channel" click can't start two builds.

## Indexes

Every foreign key has an index; status/type columns used for filtering (`Channel.status`,
`Episode.status`, `Asset.type`, `Asset.status`, `JobRun.jobType + status`) are indexed for the
dashboard/kanban/admin queries that filter on them.
