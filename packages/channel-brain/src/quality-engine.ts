import { z } from "zod";
import { qualityCheckSchema, type EpisodeScript, type QualityCheck, type QualityReviewResult, type QualityRiskCategory } from "@channelbase/shared";
import type { LLMProvider } from "@channelbase/providers";

const SYSTEM_PROMPT = `You are the Quality & Originality Engine, an automated editorial reviewer. Score this episode
0-100 on each subjective dimension below, with a one-sentence explanation for each score. Be
genuinely critical — most channels should NOT get a 90+ on every axis. Compare against the prior
episode summaries provided to judge repetition; if none are provided, score repetition checks 100
(nothing to repeat yet).

Dimensions to score: storySimilarity (higher = LESS similar to prior episodes, i.e. more original),
visualRepetition (higher = more visual variety), scriptRepetition (higher = more varied dialogue/
structure), hookRepetition (higher = more distinct hook vs prior episodes), characterConsistency
(higher = characters behave true to their established personality), brandConsistency (higher =
matches brand tone/visual rules), continuityConsistency (higher = no plot/world contradictions).`;

const subjectiveChecksSchema = z.object({
  checks: z.array(qualityCheckSchema).length(7),
  notes: z.string().optional(),
});

const HEURISTIC_KEYS = ["missingAssets", "durationCompliance"] as const;
const SUBJECTIVE_KEYS = ["storySimilarity", "visualRepetition", "scriptRepetition", "hookRepetition", "characterConsistency", "brandConsistency", "continuityConsistency"] as const;

export interface QualityReviewInput {
  script: EpisodeScript;
  priorEpisodeSummaries: string[];
  targetDurationSeconds: number;
  actualDurationSeconds: number;
  missingAssetCount: number;
  totalAssetCount: number;
}

export class QualityEngine {
  constructor(private readonly llm: LLMProvider) {}

  async review(input: QualityReviewInput): Promise<QualityReviewResult> {
    const heuristics = this.computeHeuristics(input);

    const prompt = `Episode: "${input.script.title}"
Summary: ${input.script.summary}
Hook: ${input.script.hook}
Scenes: ${input.script.scenes.map((s) => `- ${s.purpose}: ${s.action} (${s.emotion})`).join("\n")}

Prior episode summaries (most recent first):
${input.priorEpisodeSummaries.length ? input.priorEpisodeSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n") : "(none — this is one of the channel's first episodes)"}

Score exactly these 7 checks in this order: ${SUBJECTIVE_KEYS.join(", ")}.`;

    const { checks: subjectiveChecks, notes } = await this.llm.generateStructured({
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      schema: subjectiveChecksSchema,
      maxTokens: 2048,
    });

    const allChecks: QualityCheck[] = [...heuristics, ...subjectiveChecks];
    const overallScore = Math.round(allChecks.reduce((sum, c) => sum + c.score, 0) / allChecks.length);
    const riskCategories = this.deriveRiskCategories(allChecks);

    return { overallScore, checks: allChecks, riskCategories, notes };
  }

  private computeHeuristics(input: QualityReviewInput): QualityCheck[] {
    const durationDelta = Math.abs(input.actualDurationSeconds - input.targetDurationSeconds);
    const durationScore = Math.max(0, 100 - Math.round((durationDelta / Math.max(1, input.targetDurationSeconds)) * 200));
    const missingRatio = input.totalAssetCount > 0 ? input.missingAssetCount / input.totalAssetCount : 0;
    const missingScore = Math.round(100 * (1 - missingRatio));

    return [
      { key: "missingAssets", score: missingScore, explanation: `${input.missingAssetCount} of ${input.totalAssetCount} assets missing or failed.` },
      { key: "durationCompliance", score: durationScore, explanation: `Target ${input.targetDurationSeconds}s vs actual ${input.actualDurationSeconds}s (Δ${durationDelta}s).` },
    ];
  }

  private deriveRiskCategories(checks: QualityCheck[]): QualityRiskCategory[] {
    const byKey = Object.fromEntries(checks.map((c) => [c.key, c.score]));
    const risks: QualityRiskCategory[] = [];
    if ((byKey.storySimilarity ?? 100) < 50 || (byKey.scriptRepetition ?? 100) < 50 || (byKey.hookRepetition ?? 100) < 50) {
      risks.push("REPETITION_RISK");
    }
    if ((byKey.missingAssets ?? 100) < 60 || (byKey.durationCompliance ?? 100) < 40) {
      risks.push("LOW_VALUE_AUTOMATION_RISK");
    }
    return risks;
  }
}

export { HEURISTIC_KEYS, SUBJECTIVE_KEYS };
