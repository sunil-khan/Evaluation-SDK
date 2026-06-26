import { ConfigError, ScorerError } from "../errors.js";
import type { ScoreResult, Scorer, TestCase } from "../types.js";

interface CompositeOptions {
  /** The inner scorers to combine. */
  readonly scorers: ReadonlyArray<Scorer>;
  /** Weights for each scorer. Must sum to 1.0 and match scorers length. */
  readonly weights: ReadonlyArray<number>;
  /** Normalized pass threshold. Default: 0.6. */
  readonly threshold?: number;
}

const WEIGHT_TOLERANCE = 0.001;

/**
 * Creates a composite scorer that combines multiple scorers via weighted average.
 * Validates weights at construction time (must sum to 1.0, match scorers length).
 *
 * @param options - Scorers, weights, and threshold.
 * @returns A Scorer instance.
 * @throws ConfigError if weights are invalid.
 */
export function composite(options: CompositeOptions): Scorer {
  const { scorers, weights } = options;
  const threshold = options.threshold ?? 0.6;

  if (scorers.length !== weights.length) {
    throw new ConfigError(
      `composite: scorers length (${scorers.length}) must match weights length (${weights.length}).`,
    );
  }

  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (Math.abs(weightSum - 1.0) > WEIGHT_TOLERANCE) {
    throw new ConfigError(`composite: weights must sum to 1.0, but got ${weightSum.toFixed(4)}.`);
  }

  return {
    name: "composite",
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: scorer logic requires branching for error/weight redistribution
    async score(testCase: TestCase): Promise<ScoreResult> {
      const start = performance.now();

      // Run all inner scorers, catching errors
      const results: Array<{ result: ScoreResult; weight: number }> = [];
      for (let i = 0; i < scorers.length; i++) {
        const scorer = scorers[i] as Scorer;
        const weight = weights[i] as number;

        try {
          const result = await scorer.score(testCase);
          results.push({ result, weight });
        } catch (err) {
          results.push({
            result: {
              scorer: scorer.name,
              score: 0,
              passed: false,
              reason: `Scorer threw: ${err instanceof Error ? err.message : String(err)}`,
              error: new ScorerError(`Scorer "${scorer.name}" threw in composite`, {
                scorerName: scorer.name,
                caseId: testCase.id,
                cause: err instanceof Error ? err : new Error(String(err)),
              }),
              latencyMs: performance.now() - start,
            },
            weight,
          });
        }
      }

      // Separate successful and errored results
      const successful = results.filter((r) => r.result.error === undefined);
      const errored = results.filter((r) => r.result.error !== undefined);

      // All errored — return combined error
      if (successful.length === 0) {
        return {
          scorer: "composite",
          score: 0,
          passed: false,
          reason: `All ${errored.length} inner scorers errored.`,
          error: new ScorerError("All inner scorers in composite failed", {
            scorerName: "composite",
            caseId: testCase.id,
          }),
          raw: results.map((r) => r.result),
          latencyMs: performance.now() - start,
        };
      }

      // Redistribute errored weights proportionally
      const successfulWeightSum = successful.reduce((sum, r) => sum + r.weight, 0);
      let weightedScore = 0;

      const breakdown: string[] = [];
      for (const { result, weight } of results) {
        if (result.error !== undefined) {
          breakdown.push(`${result.scorer}: ERROR (w:${weight.toFixed(2)})`);
          continue;
        }
        const adjustedWeight = weight / successfulWeightSum;
        weightedScore += result.score * adjustedWeight;
        breakdown.push(`${result.scorer}: ${result.score.toFixed(2)} (w:${weight.toFixed(2)})`);
      }

      const passed = weightedScore >= threshold;

      return {
        scorer: "composite",
        score: weightedScore,
        passed,
        reason: breakdown.join(" | "),
        raw: results.map((r) => r.result),
        latencyMs: performance.now() - start,
      };
    },
  };
}
