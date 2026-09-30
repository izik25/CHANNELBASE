import type { ZodType } from "zod";
import { createLogger } from "@channelbase/logger";
import type { AnalyzeParams, GenerateStructuredParams, GenerateTextParams, LLMProvider } from "../interfaces.js";

const log = createLogger("provider:llm:mock");

/**
 * Deterministic, offline LLM stand-in. It does not call any external API —
 * it builds structurally-valid output by inspecting the Zod schema shape and
 * filling plausible-looking values so the rest of the pipeline (which only
 * cares that the contract is satisfied) works end-to-end without a real key.
 *
 * This is intentionally simple pattern matching, not a language model: swap
 * LLM_PROVIDER=anthropic (see ./anthropic.ts) once you have a key to get real
 * generations using the exact same call sites.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = "mock-llm";
  readonly isMock = true;

  async generateStructured<T>({ schema, prompt }: GenerateStructuredParams<T>): Promise<T> {
    log.debug({ promptPreview: prompt.slice(0, 120) }, "mock LLM generateStructured");
    const value = fabricateFromSchema(schema, extractSeedWords(prompt));
    return schema.parse(value);
  }

  async generateText({ prompt }: GenerateTextParams): Promise<string> {
    const seed = extractSeedWords(prompt).slice(0, 6).join(" ");
    return `[MOCK] Generated response for: ${seed || "your request"}. Configure LLM_PROVIDER and LLM_API_KEY to use a real model.`;
  }

  async analyze({ prompt }: AnalyzeParams): Promise<string> {
    return `[MOCK] Analysis (${prompt.slice(0, 60)}...): no anomalies detected in mock mode.`;
  }
}

const STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "your",
  "will",
  "which",
  "about",
  "into",
  "only",
  "each",
  "produce",
  "generate",
  "complete",
  "structured",
  "following",
  "should",
  "build",
]);

/**
 * Prompts sent to generateStructured are engineering instructions wrapped
 * around the actual user-facing idea (e.g. `packages/channel-brain` wraps the
 * source prompt in `"""..."""`). Prefer that quoted excerpt so mock output
 * reflects the channel's actual topic instead of leaking instruction text
 * like "produce a complete ChannelSpec" into every generated field.
 */
function extractSeedWords(text: string): string[] {
  const quoted = text.match(/"""([\s\S]*?)"""/)?.[1];
  const source = quoted ?? text;
  return source
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, 12);
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-mock-${Date.now().toString(36)}-${counter}`;
}

/**
 * Walks a Zod schema's runtime shape (via `_def`) and produces a value
 * satisfying it. Covers the subset of Zod used across ChannelSpec and
 * friends: object, array, string, number, boolean, enum, literal, optional,
 * default, nullable, record. Falls back to a labeled placeholder for
 * anything unrecognized so the mock never throws on valid input schemas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fabricateFromSchema(schema: ZodType<any>, seedWords: string[], path: string[] = []): any {
  const def = (schema as unknown as { _def: Record<string, unknown> })._def;
  const typeName = def.typeName as string;
  const label = path[path.length - 1] ?? "value";
  const context = seedWords.length ? seedWords.join(" ") : "channel concept";

  switch (typeName) {
    case "ZodObject": {
      const shape = (def.shape as () => Record<string, ZodType<unknown>>)();
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        out[key] = fabricateFromSchema(shape[key]!, seedWords, [...path, key]);
      }
      return out;
    }
    case "ZodArray": {
      const exactLength = (def.exactLength as { value: number } | null)?.value;
      const minLength = (def.minLength as { value: number } | null)?.value;
      const heuristicCount = /^(scenes|items|characters|characterIds)$/i.test(label) ? 2 : 1;
      const count = exactLength ?? Math.max(minLength ?? 0, heuristicCount);
      return Array.from({ length: count }, (_, i) =>
        fabricateFromSchema(def.type as ZodType<unknown>, seedWords, [...path, `${label}[${i}]`]),
      );
    }
    case "ZodString":
      return fabricateString(label, context);
    case "ZodNumber":
      return fabricateNumber(label, def, path);
    case "ZodBoolean":
      return /disallow|forbidden|explicit/i.test(label) ? false : true;
    case "ZodEnum": {
      const values = def.values as string[];
      // Inside an array (e.g. `z.array(qualityCheckSchema).length(7)`, each with a `key:
      // z.enum([...])` field), always picking values[0] would give every element the exact
      // same enum value — for qualityCheckSchema.key specifically, that means all 7 "quality
      // checks" fabricate as duplicate "storySimilarity" entries (a real bug this caused: a
      // React key-collision warning, and a quality review that silently checked the same
      // thing seven times). Cycling by array index keeps each element distinct instead.
      const index = nearestArrayIndex(path);
      return values[index !== undefined ? index % values.length : 0];
    }
    case "ZodLiteral":
      return def.value;
    case "ZodOptional":
    case "ZodNullable":
      return fabricateFromSchema(def.innerType as ZodType<unknown>, seedWords, path);
    case "ZodDefault": {
      const defaultVal = (def.defaultValue as () => unknown)();
      if (Array.isArray(defaultVal) && defaultVal.length === 0) {
        return fabricateFromSchema(def.innerType as ZodType<unknown>, seedWords, path);
      }
      return defaultVal;
    }
    case "ZodRecord":
      return {};
    case "ZodUnion": {
      const options = def.options as ZodType<unknown>[];
      return fabricateFromSchema(options[0]!, seedWords, path);
    }
    default:
      return `mock-${label}-${nextId("val")}`;
  }
}

const MOCK_HEX_PALETTE = ["#6D28D9", "#F97316", "#FACC15", "#0EA5E9", "#EC4899", "#10B981"];
let colorCounter = 0;

function fabricateString(label: string, context: string): string {
  const lower = label.toLowerCase();
  const shortContext = context.split(" ").slice(0, 4).join(" ");
  // Only real identifier fields (exactly "id", or camelCase ending in "...Id" like
  // "characterId"/"sceneId") should get a random id. A naive `lower.includes("id")` also
  // matches fields like "titleIdea" (contains "idea" -> "id") or "provider", turning
  // human-facing text like episode titles into garbage like "id-mock-8xk2-3".
  if (label === "id" || /Id$/.test(label)) return nextId("id");
  if (lower.includes("color")) return MOCK_HEX_PALETTE[colorCounter++ % MOCK_HEX_PALETTE.length]!;
  if (lower.includes("date")) return new Date().toISOString();
  if (lower.includes("prompt")) return `A vibrant, consistent illustration of ${shortContext}, mock-generated placeholder art direction.`;
  if (lower.includes("titleidea") || lower === "title") return `${titleCase(shortContext) || "A New Episode"}!`;
  if (lower.includes("name")) return `The ${titleCase(shortContext) || "New"} Channel`;
  if (lower === "tagline") return `Big adventures, small ${shortContext || "wonders"}.`;
  if (lower.includes("hook")) return `You won't believe what happens with ${shortContext || "our heroes"} today!`;
  if (lower.includes("description") || lower.includes("summary") || lower.includes("premise"))
    return `[MOCK] A friendly, structured placeholder description about ${context || "the channel concept"}, generated without a live LLM connection.`;
  return `[MOCK] ${titleCase(label)} about ${shortContext || "the concept"}`;
}

/** Recovers the 0-based index of the nearest enclosing array element from a fabrication path like [..., "scenes[2]", "sceneNumber"]. */
function nearestArrayIndex(path: string[]): number | undefined {
  for (let i = path.length - 2; i >= 0; i--) {
    const match = path[i]!.match(/\[(\d+)\]$/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function fabricateNumber(label: string, def: Record<string, unknown>, path: string[]): number {
  const lower = label.toLowerCase();
  const checks = (def.checks as Array<{ kind: string; value?: number; inclusive?: boolean }>) ?? [];
  const minCheck = checks.find((c) => c.kind === "min");
  const maxCheck = checks.find((c) => c.kind === "max");
  // A `.positive()`/exclusive `.min()` constraint reports value:0 with inclusive:false —
  // returning 0 would fail validation, so bump past it.
  const min = minCheck?.value === undefined ? undefined : minCheck.inclusive === false ? minCheck.value + 1 : minCheck.value;
  const max = maxCheck?.value === undefined ? undefined : maxCheck.inclusive === false ? maxCheck.value - 1 : maxCheck.value;

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  // Sequence numbers (sceneNumber, shotNumber, ...) must be unique per array element —
  // derive them from the element's own index rather than a constant, or every scene/shot
  // in a fabricated array would collide on the same DB unique constraint.
  if (/(scene|shot)number$/i.test(label)) {
    const index = nearestArrayIndex(path);
    return clamp((index ?? 0) + 1);
  }

  if (lower.includes("agemin")) return clamp(4);
  if (lower.includes("agemax")) return clamp(7);
  // Most specific first: a per-scene/shot duration is seconds-of-screen-time (tens of
  // seconds), NOT the same magnitude as a whole episode's target length — conflating them
  // previously made every scene "480 seconds" and inflated mock generation cost 10-20x.
  if (lower.includes("durationestimateseconds")) return clamp(30);
  if (lower.includes("short") && (lower.includes("durationseconds") || lower.includes("targetseconds"))) return clamp(45);
  if (lower.includes("durationseconds") || lower.includes("targetseconds") || lower === "duration") return clamp(480);
  if (lower.includes("perweek")) return clamp(3);
  if (lower.includes("priority")) return clamp(3);
  // Check/quality scores default to a plausible mid-high value rather than the schema's
  // bare minimum (0), which otherwise makes every mock QualityReview look like a failure.
  if (lower === "score" || lower.endsWith("score")) return clamp(78);
  if (min !== undefined) return min;
  return clamp(1);
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}
