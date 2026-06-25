import { ScorerError } from "./errors.js";
import type { CaseReport, ProgressEvent, ScoreResult, Scorer, TestCase } from "./types.js";

export interface RunConfig<TInput = unknown, TExpected = unknown> {
  readonly cases: ReadonlyArray<TestCase<TInput, TExpected>>;
  readonly scorers: ReadonlyArray<Scorer<TInput, TExpected>>;
  readonly concurrency: number;
  readonly passPolicy: "all" | "any";
  readonly onProgress?: ((event: ProgressEvent) => void) | undefined;
}

/**
 * Scores a single test case with a single scorer, catching any thrown errors.
 * Errors are returned as ScoreResult.error, never propagated.
 */
async function scoreWithIsolation(scorer: Scorer, testCase: TestCase): Promise<ScoreResult> {
  const start = performance.now();
  try {
    return await scorer.score(testCase);
  } catch (err) {
    const latencyMs = performance.now() - start;
    return {
      scorer: scorer.name,
      score: 0,
      passed: false,
      reason: `Scorer threw an error: ${err instanceof Error ? err.message : String(err)}`,
      error: new ScorerError(
        `Scorer "${scorer.name}" threw during evaluation of case "${testCase.id}"`,
        {
          scorerName: scorer.name,
          caseId: testCase.id,
          cause: err instanceof Error ? err : new Error(String(err)),
        },
      ),
      latencyMs,
    };
  }
}

/**
 * Evaluates a single test case against all scorers.
 */
async function evaluateCase(
  testCase: TestCase,
  scorers: ReadonlyArray<Scorer>,
  passPolicy: "all" | "any",
): Promise<CaseReport> {
  const results = await Promise.all(scorers.map((scorer) => scoreWithIsolation(scorer, testCase)));

  const passed =
    passPolicy === "all" ? results.every((r) => r.passed) : results.some((r) => r.passed);

  return { testCase, results, passed };
}

/**
 * Runs all test cases with bounded concurrency and error isolation.
 * Returns CaseReports in the original case order regardless of completion order.
 */
export async function runCases<TInput = unknown, TExpected = unknown>(
  config: RunConfig<TInput, TExpected>,
): Promise<CaseReport[]> {
  const { cases, scorers, concurrency, passPolicy, onProgress } = config;
  const results: CaseReport[] = new Array(cases.length) as CaseReport[];
  const startTime = performance.now();
  let completed = 0;

  // Hand-rolled promise pool for bounded concurrency
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < cases.length) {
      const index = nextIndex;
      nextIndex++;

      const testCase = cases[index];
      if (!testCase) continue;

      const report = await evaluateCase(testCase, scorers, passPolicy);
      results[index] = report;

      completed++;
      onProgress?.({
        completed,
        total: cases.length,
        latestCaseId: testCase.id,
        elapsedMs: performance.now() - startTime,
      });
    }
  }

  // Launch up to `concurrency` workers
  const workerCount = Math.min(concurrency, cases.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  return results;
}
