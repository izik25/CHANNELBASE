# Production pipeline

## Job chain

`POST /episodes/:id/generate` creates a `JobRun(GENERATE_SCRIPT)` and enqueues it. Each processor
in `apps/worker/src/processors/` does one pipeline stage, updates `Episode.status`, publishes an
`EpisodeProgressEvent` over Redis pub/sub (consumed by the episode page's SSE stream), and enqueues
the next job type on success:

```
GENERATE_SCRIPT     Episode → SCRIPTING → SCRIPT_REVIEW      (ScriptEngine, full scene-by-scene script)
      ↓
BREAKDOWN_EPISODE   → SCENE_BREAKDOWN                        (creates Scene+Shot rows, compiles DirectorSpec per scene)
      ↓
GENERATE_IMAGE      → ASSET_GENERATION                       (one IMAGE asset per scene)
      ↓
GENERATE_VOICE      → VOICE_GENERATION                       (one VOICE asset per scene with dialogue/narration)
      ↓
GENERATE_VIDEO      → VIDEO_GENERATION                        (one VIDEO asset per scene)
      ↓
GENERATE_MUSIC      (still VIDEO_GENERATION)                  (one MUSIC asset for the episode)
      ↓
ASSEMBLE_VIDEO       → ASSEMBLY                               (MediaComposer → FINAL_VIDEO asset)
      ↓
GENERATE_THUMBNAIL   (still ASSEMBLY)                          (ThumbnailEngine → THUMBNAIL asset)
      ↓
GENERATE_METADATA    → QUALITY_REVIEW → READY                 (MetadataEngine, then QualityEngine → QualityReview row)
```

`CREATE_CHANNEL` is a separate, self-contained job (not part of the episode chain) that runs the
whole channel-creation workflow (`apps/worker/src/processors/create-channel.ts`) in one job,
publishing one `ChannelBuildProgressEvent` per named stage (`packages/shared/src/build-progress.ts`)
— this is deliberately a single long job rather than a chain, since the UI only needs 7 coarse
milestones, not per-substep granularity.

`GENERATE_BRAND`, `GENERATE_CHARACTERS`, and `GENERATE_CONTENT_PLAN` also exist as standalone job
types for future "regenerate this" actions, reusing the same channel-brain engines the initial
build uses.

## A failed scene doesn't restart the episode

Each scene's image/voice/video generation is a separate `Asset` row keyed by
`idempotencyKey: "image:${sceneId}"` etc. If one scene's provider call fails, that Asset is marked
`FAILED` and the loop continues to the next scene — the stage-level job still completes. The
episode page lets you click any individual asset to regenerate just that one
(`POST /episodes/:id/assets/:assetId/regenerate`), which re-runs the single-scene generation
function directly (no need to re-run the whole episode).

## Retries

`markFailedOrRetry` (`apps/worker/src/lib/job-run.ts`) is called from every processor's catch
block. If `JobRun.attemptCount < maxAttempts` (default 3), it re-enqueues with exponential backoff
(`2^attempt * 2000ms`) and status `RETRYING`; once attempts are exhausted, status becomes `FAILED`
and it shows up in the admin "failed jobs" list with a one-click retry.

## Composition & the ffmpeg fallback

`MediaComposer` (`packages/production/src/composer.ts`) only runs real ffmpeg composition when
ffmpeg is installed **and** every input asset is a real playable file (not a mock placeholder).
Otherwise it writes a JSON manifest listing exactly what would have been composed (clip order,
narration, music, logo, subtitles) as the `FINAL_VIDEO` asset. Command construction is never an
inline giant string — every operation (concat, audio mix, subtitle mux, resize, Shorts crop, logo
overlay, trim, export) is its own small builder function in
`packages/production/src/command-builders.ts` returning an argv array for `FFmpegService.run()`.

## Quality review

`QualityEngine` (`packages/channel-brain/src/quality-engine.ts`) combines two heuristics computed
directly from data (`missingAssets`, `durationCompliance`) with seven LLM-scored dimensions
(originality vs. prior episodes, visual/script/hook repetition, character/brand/continuity
consistency). The overall score is a simple average; scores below threshold on repetition or
completion checks flag `riskCategories` (`REPETITION_RISK`, `LOW_VALUE_AUTOMATION_RISK`). This is
an editorial signal for the creator, not a monetization or policy guarantee.
