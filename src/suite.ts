import { ConfigError } from './errors.js';
import { runCases } from './runner.js';
import type { CaseReport, Report, ReportSummary, ScoreResult, SuiteConfig } from './types.js';
import { suiteConfigSchema } from './types.js';

/**
 * A configured evaluation suite ready to be run.
 */
interface Suite {
  /** Execute the suite and return the complete report. */
  run(): Promise<Report>;
}

function buildSummary(cases: ReadonlyArray<CaseReport>, scorerNames: string[]): ReportSummary {
  const total = cases.length;
  const passed = cases.filter((c) => c.passed).length;
  const failed = total - passed;
  const errored = cases.filter((c) => c.results.some((r) => r.error !== undefined)).length;
  const passRate = total > 0 ? passed / total : 0;

  const byScorer: Record<string, { passRate: number; avgScore: number }> = {};
  for (const name of scorerNames) {
    const scorerResults: ScoreResult[] = [];
    for (const c of cases) {
      const result = c.results.find((r) => r.scorer === name);
      if (result) {
        scorerResults.push(result);
      }
    }
    const scorerPassed = scorerResults.filter((r) => r.passed).length;
    const scorerTotal = scorerResults.length;
    const avgScore =
      scorerTotal > 0
        ? scorerResults.reduce((sum, r) => sum + r.score, 0) / scorerTotal
        : 0;

    byScorer[name] = {
      passRate: scorerTotal > 0 ? scorerPassed / scorerTotal : 0,
      avgScore,
    };
  }

  const allLatencies: number[] = [];
  for (const c of cases) {
    for (const r of c.results) {
      allLatencies.push(r.latencyMs);
    }
  }
  const avgLatencyMs =
    allLatencies.length > 0
      ? allLatencies.reduce((sum, l) => sum + l, 0) / allLatencies.length
      : 0;

  return { total, passed, failed, errored, passRate, byScorer, avgLatencyMs };
}

/**
 * Creates an evaluation suite from the given configuration.
 * Validates config at construction time — throws ConfigError for invalid configs.
 *
 * @param config - Suite configuration with cases and scorers.
 * @returns A Suite with a run() method.
 * @throws ConfigError if the configuration is invalid.
 */
export function defineSuite<TInput = unknown, TExpected = unknown>(
  config: SuiteConfig<TInput, TExpected>
): Suite {
  const parseResult = suiteConfigSchema.safeParse(config);
  if (!parseResult.success) {
    const messages = parseResult.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(`Suite validation failed:\n${messages.join('\n')}`);
  }

  const concurrency = config.concurrency ?? 4;
  const passPolicy = config.passPolicy ?? 'all';

  return {
    async run(): Promise<Report> {
      const startedAt = new Date().toISOString();

      const caseReports = await runCases({
        cases: config.cases,
        scorers: config.scorers,
        concurrency,
        passPolicy,
        onProgress: config.onProgress,
      });

      const finishedAt = new Date().toISOString();
      const scorerNames = config.scorers.map((s) => s.name);
      const summary = buildSummary(caseReports, scorerNames);

      return {
        suite: config.name,
        startedAt,
        finishedAt,
        cases: caseReports,
        summary,
      };
    },
  };
}
