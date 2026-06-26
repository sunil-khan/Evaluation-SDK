import { ScorerError } from "../errors.js";
import type { ScoreResult, Scorer, TestCase } from "../types.js";

interface ExactMatchOptions {
  /** Trim, collapse whitespace, and lowercase before comparing. Default: true. */
  readonly normalize?: boolean;
  /** Strip punctuation before comparing. Default: false. */
  readonly ignorePunctuation?: boolean;
}

function normalizeText(text: string, options: ExactMatchOptions): string {
  let result = text;

  if (options.normalize !== false) {
    result = result.trim().toLowerCase().replace(/\s+/g, " ");
  }

  if (options.ignorePunctuation === true) {
    result = result.replace(/[^\w\s]/g, "");
  }

  return result;
}

function findFirstDivergence(a: string, b: string): string {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) {
      return `Strings differ at index ${i}: expected "${b[i]}" but got "${a[i]}"`;
    }
  }
  if (a.length !== b.length) {
    return `Strings differ in length: output has ${a.length} chars, expected has ${b.length} chars`;
  }
  return "Strings are identical";
}

/**
 * Creates an exact-match scorer that compares output against expected.
 * Returns a score of 1 (match) or 0 (mismatch).
 *
 * @param options - Normalization and punctuation options.
 * @returns A Scorer instance.
 */
export function exactMatch(options: ExactMatchOptions = {}): Scorer {
  return {
    name: "exactMatch",
    async score(testCase: TestCase): Promise<ScoreResult> {
      const start = performance.now();

      if (testCase.expected === undefined || testCase.expected === null) {
        const latencyMs = performance.now() - start;
        return {
          scorer: "exactMatch",
          score: 0,
          passed: false,
          reason: "exactMatch requires `expected` to be set on the test case.",
          error: new ScorerError("exactMatch requires `expected` to be set on the test case.", {
            scorerName: "exactMatch",
            caseId: testCase.id,
          }),
          latencyMs,
        };
      }

      const output = normalizeText(String(testCase.output), options);
      const expected = normalizeText(String(testCase.expected), options);
      const isMatch = output === expected;
      const latencyMs = performance.now() - start;

      return {
        scorer: "exactMatch",
        score: isMatch ? 1 : 0,
        passed: isMatch,
        reason: isMatch ? "Exact match." : findFirstDivergence(output, expected),
        latencyMs,
      };
    },
  };
}
