import { z } from "zod";
// biome-ignore lint/suspicious/noShadowRestrictedNames: EvalError is our custom error class, intentionally named to match the domain
import type { EvalError } from "./errors.js";

/**
 * A single evaluation test case.
 *
 * @typeParam TInput - The type of the input sent to the system under test.
 * @typeParam TExpected - The type of the expected reference value.
 */
export interface TestCase<TInput = unknown, TExpected = unknown> {
  /** Unique identifier for this test case. */
  readonly id: string;
  /** The input that was or should be sent to the system under test. */
  readonly input: TInput;
  /** The LLM output being evaluated. Must be resolved before scoring. */
  readonly output: string;
  /** Optional reference value (golden answer, rubric, etc.). */
  readonly expected?: TExpected | undefined;
  /** Arbitrary metadata attached to this case. */
  readonly metadata?: Record<string, unknown> | undefined;
}

/**
 * A scorer evaluates a test case and returns a normalized result.
 *
 * @typeParam TInput - The type of the input in the test case.
 * @typeParam TExpected - The type of the expected value in the test case.
 */
export interface Scorer<TInput = unknown, TExpected = unknown> {
  /** Human-readable name identifying this scorer. */
  readonly name: string;
  /** Evaluate a test case and return a normalized score result. */
  score(testCase: TestCase<TInput, TExpected>): Promise<ScoreResult>;
}

/**
 * The result of a single scorer evaluating a single test case.
 * Every scorer normalizes its score to the 0..1 range.
 */
export interface ScoreResult {
  /** Name of the scorer that produced this result. */
  readonly scorer: string;
  /** Normalized score in the range [0, 1]. */
  readonly score: number;
  /** Whether the score met the scorer's threshold. */
  readonly passed: boolean;
  /** Human-readable explanation of why this score was given. */
  readonly reason?: string | undefined;
  /** Scorer-specific detail (e.g. the full judge prompt and response). */
  readonly raw?: unknown;
  /** Present if the scorer failed to produce a score. */
  readonly error?: EvalError | undefined;
  /** Time taken to produce this result, in milliseconds. */
  readonly latencyMs: number;
}

/**
 * Progress event emitted during suite execution after each case completes.
 */
export interface ProgressEvent {
  /** Number of cases completed so far. */
  readonly completed: number;
  /** Total number of cases in the suite. */
  readonly total: number;
  /** ID of the most recently completed case. */
  readonly latestCaseId: string;
  /** Milliseconds elapsed since suite.run() was called. */
  readonly elapsedMs: number;
}

/**
 * Configuration for defining an evaluation suite.
 *
 * @typeParam TInput - The input type for test cases and scorers.
 * @typeParam TExpected - The expected value type for test cases and scorers.
 */
export interface SuiteConfig<TInput = unknown, TExpected = unknown> {
  /** Human-readable name for this suite. */
  readonly name: string;
  /** The test cases to evaluate. */
  readonly cases: ReadonlyArray<TestCase<TInput, TExpected>>;
  /** The scorers to apply to each test case. */
  readonly scorers: ReadonlyArray<Scorer<TInput, TExpected>>;
  /** Maximum number of cases to evaluate concurrently. Default: 4. */
  readonly concurrency?: number | undefined;
  /** How a case "passes" with multiple scorers. Default: 'all'. */
  readonly passPolicy?: "all" | "any" | undefined;
  /** Callback invoked after each case completes. */
  readonly onProgress?: ((event: ProgressEvent) => void) | undefined;
}

/**
 * The result of evaluating a single test case across all scorers.
 */
export interface CaseReport {
  /** The test case that was evaluated. */
  readonly testCase: TestCase;
  /** Score results from each scorer. */
  readonly results: ReadonlyArray<ScoreResult>;
  /** Whether this case passed according to the suite's passPolicy. */
  readonly passed: boolean;
}

/**
 * The complete result of running an evaluation suite.
 */
export interface Report {
  /** Name of the suite that produced this report. */
  readonly suite: string;
  /** ISO 8601 timestamp when the suite run started. */
  readonly startedAt: string;
  /** ISO 8601 timestamp when the suite run finished. */
  readonly finishedAt: string;
  /** Per-case evaluation results, ordered by original case index. */
  readonly cases: ReadonlyArray<CaseReport>;
  /** Aggregate statistics for the suite run. */
  readonly summary: ReportSummary;
}

/**
 * Aggregate statistics for a suite run.
 */
export interface ReportSummary {
  /** Total number of cases evaluated. */
  readonly total: number;
  /** Number of cases where CaseReport.passed === true. */
  readonly passed: number;
  /** Number of cases where CaseReport.passed === false. passed + failed = total. */
  readonly failed: number;
  /** Number of cases with at least one scorer error. Can overlap with failed. */
  readonly errored: number;
  /** Pass rate: passed / total. Range [0, 1]. */
  readonly passRate: number;
  /** Per-scorer aggregate statistics. */
  readonly byScorer: Record<string, { passRate: number; avgScore: number }>;
  /** Average latency across all scorer invocations, in milliseconds. */
  readonly avgLatencyMs: number;
}

/**
 * Adapter for chat-based LLM providers. Users implement this for their provider.
 */
export interface ChatAdapter {
  /** Send a chat completion request and return the response content. */
  complete(params: {
    system?: string;
    messages: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
    temperature?: number;
  }): Promise<{ content: string }>;
}

/**
 * Adapter for embedding providers. Users implement this for their provider.
 */
export interface EmbeddingAdapter {
  /** Embed one or more texts and return their vector representations. */
  embed(texts: ReadonlyArray<string>): Promise<ReadonlyArray<ReadonlyArray<number>>>;
}

/**
 * A reporter takes a Report and presents it (console, file, etc.).
 */
export type Reporter = (report: Report) => void | Promise<void>;

// --- Zod Schemas for runtime validation ---

export const testCaseSchema = z.object({
  id: z.string().min(1, "Test case id must be a non-empty string"),
  input: z.unknown(),
  output: z.string(),
  expected: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const suiteConfigSchema = z.object({
  name: z.string().min(1, "Suite name must be a non-empty string"),
  cases: z.array(testCaseSchema).min(1, "Suite must contain at least one test case"),
  scorers: z
    .array(
      z.object({
        name: z.string(),
        score: z.function(),
      }),
    )
    .min(1, "Suite must contain at least one scorer"),
  concurrency: z.number().int().positive().optional(),
  passPolicy: z.enum(["all", "any"]).optional(),
  onProgress: z.function().optional(),
});
