# evalkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade TypeScript LLM evaluation SDK with four scorers, bounded-concurrency runner, and pluggable reporters.

**Architecture:** Separated runner pattern — `suite.ts` handles config validation and report assembly, `runner.ts` handles concurrency and error isolation. All scorers normalize to 0..1. Errors returned as values (not thrown) during scoring. Types, scorers, runner, reporters each in focused files.

**Tech Stack:** TypeScript (strict), pnpm, vitest, tsup, biome, zod

## Global Constraints

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- No `any` in public API
- Zero `console.log` in core — only reporters write output
- Core dependency: `zod` only. No other runtime deps.
- ESM-first, dual CJS+ESM output via tsup
- Node 18+ target. Core logic avoids Node-only APIs.
- Conventional commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`
- Every source file has a corresponding test file
- All tests deterministic — mock adapters, no real API calls

## File Map

| File | Responsibility |
|---|---|
| `src/types.ts` | All interfaces: TestCase, Scorer, ScoreResult, Report, CaseReport, SuiteConfig, ProgressEvent, ChatAdapter, EmbeddingAdapter, Reporter |
| `src/errors.ts` | All error classes: EvalError base, ConfigError, AdapterError, JudgeParseError, ScorerError |
| `src/scorers/exact-match.ts` | exactMatch factory function |
| `src/scorers/semantic-similarity.ts` | semanticSimilarity factory function |
| `src/scorers/llm-judge.ts` | llmJudge factory function with structured output parsing |
| `src/scorers/composite.ts` | composite factory function with weighted averaging |
| `src/runner.ts` | Bounded-concurrency execution engine |
| `src/suite.ts` | defineSuite + Suite class with zod validation |
| `src/reporters/console.ts` | consoleReporter — colored table output |
| `src/reporters/json.ts` | jsonReporter — JSON file output |
| `vitest.config.ts` | Test runner configuration |
| `src/index.ts` | Public barrel exports |
| `test/types.test.ts` | Zod schema validation |
| `test/errors.test.ts` | Error hierarchy tests |
| `test/exact-match.test.ts` | exactMatch scorer tests |
| `test/semantic-similarity.test.ts` | semanticSimilarity scorer tests |
| `test/llm-judge.test.ts` | llmJudge scorer tests |
| `test/composite.test.ts` | composite scorer tests |
| `test/runner.test.ts` | Runner concurrency + error isolation tests |
| `test/suite.test.ts` | Suite config validation + report assembly tests |
| `test/reporters/console.test.ts` | Console reporter tests |
| `test/reporters/json.test.ts` | JSON reporter tests |

---

### Task 1: Project Scaffolding + Types

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `biome.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `src/types.ts`
- Create: `src/index.ts` (stub)
- Create: `test/types.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: All type interfaces used by every subsequent task — `TestCase<TInput, TExpected>`, `Scorer<TInput, TExpected>`, `ScoreResult`, `Report`, `CaseReport`, `SuiteConfig<TInput, TExpected>`, `ProgressEvent`, `ChatAdapter`, `EmbeddingAdapter`, `Reporter`

- [ ] **Step 1: Initialize pnpm project**

```bash
cd /Users/sunilkhan/Evaluation-SDK
pnpm init
```

- [ ] **Step 2: Install dev dependencies**

```bash
pnpm add -D typescript tsup vitest @biomejs/biome typedoc
```

- [ ] **Step 3: Install runtime dependency**

```bash
pnpm add zod
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 5: Create tsup.config.ts**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  outDir: 'dist',
});
```

- [ ] **Step 6: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noExcessiveCognitiveComplexity": "warn"
      },
      "suspicious": {
        "noExplicitAny": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": {
    "ignore": ["dist", "node_modules", "coverage"]
  }
}
```

- [ ] **Step 7: Create .gitignore**

```
node_modules/
dist/
coverage/
*.tgz
.env
.env.*
.DS_Store
```

- [ ] **Step 8: Create LICENSE (MIT)**

```
MIT License

Copyright (c) 2026 Sunil Khan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 9: Update package.json**

```json
{
  "name": "evalkit",
  "version": "0.1.0",
  "description": "A small, opinionated, well-typed TypeScript library for evaluating LLM outputs",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "biome check src/ test/",
    "lint:fix": "biome check --write src/ test/",
    "format": "biome format --write src/ test/",
    "docs": "typedoc --entryPoints src/index.ts --out docs/api",
    "ci": "pnpm lint && pnpm typecheck && pnpm test"
  },
  "keywords": ["llm", "evaluation", "testing", "ai", "scoring", "typescript"],
  "author": "Sunil Khan <khan.sunil119@gmail.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/sunil-khan/Evaluation-SDK.git"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 10: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 11: Write src/types.ts**

```ts
import { z } from 'zod';

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
  /** Present if the scorer failed to produce a score. Typed as Error to avoid circular deps — use instanceof for specific error types. */
  readonly error?: Error | undefined;
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
  readonly passPolicy?: 'all' | 'any' | undefined;
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
    messages: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
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
  id: z.string().min(1, 'Test case id must be a non-empty string'),
  input: z.unknown(),
  output: z.string(),
  expected: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const suiteConfigSchema = z.object({
  name: z.string().min(1, 'Suite name must be a non-empty string'),
  cases: z.array(testCaseSchema).min(1, 'Suite must contain at least one test case'),
  scorers: z
    .array(
      z.object({
        name: z.string(),
        score: z.function(),
      })
    )
    .min(1, 'Suite must contain at least one scorer'),
  concurrency: z.number().int().positive().optional(),
  passPolicy: z.enum(['all', 'any']).optional(),
  onProgress: z.function().optional(),
});
```

- [ ] **Step 12: Write test/types.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { suiteConfigSchema, testCaseSchema } from '../src/types.js';

describe('testCaseSchema', () => {
  it('validates a valid test case', () => {
    const result = testCaseSchema.safeParse({
      id: 'case-1',
      input: 'What is 2+2?',
      output: '4',
      expected: '4',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty id', () => {
    const result = testCaseSchema.safeParse({
      id: '',
      input: 'test',
      output: 'test',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Test case id must be a non-empty string');
    }
  });

  it('accepts test case without expected', () => {
    const result = testCaseSchema.safeParse({
      id: 'case-1',
      input: 'test',
      output: 'test',
    });
    expect(result.success).toBe(true);
  });

  it('accepts test case with metadata', () => {
    const result = testCaseSchema.safeParse({
      id: 'case-1',
      input: 'test',
      output: 'test',
      metadata: { category: 'tone', priority: 1 },
    });
    expect(result.success).toBe(true);
  });
});

describe('suiteConfigSchema', () => {
  const mockScorer = { name: 'test', score: () => Promise.resolve({}) };

  it('validates a valid suite config', () => {
    const result = suiteConfigSchema.safeParse({
      name: 'test-suite',
      cases: [{ id: 'case-1', input: 'hi', output: 'hello' }],
      scorers: [mockScorer],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty suite name', () => {
    const result = suiteConfigSchema.safeParse({
      name: '',
      cases: [{ id: 'case-1', input: 'hi', output: 'hello' }],
      scorers: [mockScorer],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Suite name must be a non-empty string');
    }
  });

  it('rejects empty cases array', () => {
    const result = suiteConfigSchema.safeParse({
      name: 'test-suite',
      cases: [],
      scorers: [mockScorer],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty scorers array', () => {
    const result = suiteConfigSchema.safeParse({
      name: 'test-suite',
      cases: [{ id: 'case-1', input: 'hi', output: 'hello' }],
      scorers: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid passPolicy values', () => {
    for (const policy of ['all', 'any'] as const) {
      const result = suiteConfigSchema.safeParse({
        name: 'test-suite',
        cases: [{ id: 'case-1', input: 'hi', output: 'hello' }],
        scorers: [mockScorer],
        passPolicy: policy,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid passPolicy', () => {
    const result = suiteConfigSchema.safeParse({
      name: 'test-suite',
      cases: [{ id: 'case-1', input: 'hi', output: 'hello' }],
      scorers: [mockScorer],
      passPolicy: 'weighted',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive concurrency', () => {
    const result = suiteConfigSchema.safeParse({
      name: 'test-suite',
      cases: [{ id: 'case-1', input: 'hi', output: 'hello' }],
      scorers: [mockScorer],
      concurrency: 0,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 13: Create stub src/index.ts**

```ts
// Public API — exports added as modules are implemented.
export type {
  TestCase,
  Scorer,
  ScoreResult,
  Report,
  CaseReport,
  SuiteConfig,
  ProgressEvent,
  ChatAdapter,
  EmbeddingAdapter,
  Reporter,
  ReportSummary,
} from './types.js';
```

- [ ] **Step 14: Run tests to verify they pass**

```bash
pnpm test
```

Expected: All tests in `test/types.test.ts` pass.

- [ ] **Step 15: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: No errors.

- [ ] **Step 16: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsup.config.ts vitest.config.ts biome.json .gitignore LICENSE src/types.ts src/index.ts test/types.test.ts
git commit -m "feat: scaffold project and define core type model

Set up TypeScript strict mode, tsup dual build, vitest, biome.
Define all interfaces: TestCase, Scorer, ScoreResult, Report,
SuiteConfig, ChatAdapter, EmbeddingAdapter.
Zod schemas for runtime config validation."
```

---

### Task 2: Error Hierarchy

**Files:**
- Create: `src/errors.ts`
- Create: `test/errors.test.ts`
- Modify: `src/index.ts` (add exports)

**Interfaces:**
- Consumes: nothing (EvalError base class defined here)
- Produces: `EvalError`, `ConfigError`, `AdapterError`, `JudgeParseError`, `ScorerError` — used by all scorers and suite

- [ ] **Step 1: Write test/errors.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import {
  AdapterError,
  ConfigError,
  EvalError,
  JudgeParseError,
  ScorerError,
} from '../src/errors.js';

describe('Error Hierarchy', () => {
  describe('ConfigError', () => {
    it('is an instance of EvalError', () => {
      const err = new ConfigError('bad config');
      expect(err).toBeInstanceOf(EvalError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ConfigError');
      expect(err.message).toBe('bad config');
    });
  });

  describe('AdapterError', () => {
    it('is an instance of EvalError and carries context', () => {
      const cause = new Error('timeout');
      const err = new AdapterError('Embedding call failed', {
        adapterType: 'embedding',
        cause,
      });
      expect(err).toBeInstanceOf(EvalError);
      expect(err.name).toBe('AdapterError');
      expect(err.adapterType).toBe('embedding');
      expect(err.cause).toBe(cause);
    });
  });

  describe('JudgeParseError', () => {
    it('is an instance of EvalError and carries raw response', () => {
      const err = new JudgeParseError('Failed to parse judge response', {
        rawResponse: 'I think score is 4',
        retriesAttempted: 2,
      });
      expect(err).toBeInstanceOf(EvalError);
      expect(err.name).toBe('JudgeParseError');
      expect(err.rawResponse).toBe('I think score is 4');
      expect(err.retriesAttempted).toBe(2);
    });
  });

  describe('ScorerError', () => {
    it('is an instance of EvalError and carries scorer + case context', () => {
      const cause = new Error('unexpected null');
      const err = new ScorerError('Scorer failed', {
        scorerName: 'exactMatch',
        caseId: 'case-42',
        cause,
      });
      expect(err).toBeInstanceOf(EvalError);
      expect(err.name).toBe('ScorerError');
      expect(err.scorerName).toBe('exactMatch');
      expect(err.caseId).toBe('case-42');
      expect(err.cause).toBe(cause);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/errors.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write src/errors.ts**

```ts
/**
 * Base class for all evalkit errors.
 */
export class EvalError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EvalError';
  }
}

/**
 * Thrown when suite configuration is invalid.
 * This is a programmer error — fail fast at construction time.
 */
export class ConfigError extends EvalError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Returned (not thrown) when an adapter call (embedding or chat) fails.
 * Carries context about which adapter type failed and the underlying cause.
 */
export class AdapterError extends EvalError {
  readonly adapterType: 'chat' | 'embedding';

  constructor(
    message: string,
    context: { adapterType: 'chat' | 'embedding'; cause?: Error }
  ) {
    super(message, context.cause ? { cause: context.cause } : undefined);
    this.name = 'AdapterError';
    this.adapterType = context.adapterType;
  }
}

/**
 * Returned (not thrown) when the LLM judge returns an unparseable response
 * after all retry attempts are exhausted.
 */
export class JudgeParseError extends EvalError {
  readonly rawResponse: string;
  readonly retriesAttempted: number;

  constructor(
    message: string,
    context: { rawResponse: string; retriesAttempted: number }
  ) {
    super(message);
    this.name = 'JudgeParseError';
    this.rawResponse = context.rawResponse;
    this.retriesAttempted = context.retriesAttempted;
  }
}

/**
 * Returned (not thrown) as a wrapper for unexpected scorer-level failures.
 * Carries the scorer name and case ID for debugging.
 */
export class ScorerError extends EvalError {
  readonly scorerName: string;
  readonly caseId: string;

  constructor(
    message: string,
    context: { scorerName: string; caseId: string; cause?: Error }
  ) {
    super(message, context.cause ? { cause: context.cause } : undefined);
    this.name = 'ScorerError';
    this.scorerName = context.scorerName;
    this.caseId = context.caseId;
  }
}
```

- [ ] **Step 4: Update src/index.ts — add error exports**

Add after existing exports:

```ts
export { EvalError, ConfigError, AdapterError, JudgeParseError, ScorerError } from './errors.js';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test test/errors.test.ts
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/errors.ts test/errors.test.ts src/index.ts
git commit -m "feat: add typed error hierarchy

ConfigError (thrown at config time), AdapterError, JudgeParseError,
ScorerError (returned as values during scoring). Each carries
contextual fields for debugging."
```

---

### Task 3: exactMatch Scorer

**Files:**
- Create: `src/scorers/exact-match.ts`
- Create: `test/exact-match.test.ts`
- Modify: `src/index.ts` (add export)

**Interfaces:**
- Consumes: `TestCase`, `Scorer`, `ScoreResult`, `EvalError` from `src/types.ts`; `ScorerError` from `src/errors.ts`
- Produces: `exactMatch(options?)` factory function returning `Scorer`

- [ ] **Step 1: Write test/exact-match.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { exactMatch } from '../src/scorers/exact-match.js';
import type { TestCase } from '../src/types.js';

describe('exactMatch', () => {
  const scorer = exactMatch();

  it('returns score 1 for matching strings', async () => {
    const tc: TestCase<string, string> = {
      id: 'match-1',
      input: 'question',
      output: 'hello world',
      expected: 'hello world',
    };
    const result = await scorer.score(tc);
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.scorer).toBe('exactMatch');
  });

  it('returns score 0 for non-matching strings', async () => {
    const tc: TestCase<string, string> = {
      id: 'no-match-1',
      input: 'question',
      output: 'hello world',
      expected: 'goodbye world',
    };
    const result = await scorer.score(tc);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('normalizes by default (trim, lowercase, collapse whitespace)', async () => {
    const tc: TestCase<string, string> = {
      id: 'normalize-1',
      input: 'question',
      output: '  Hello   World  ',
      expected: 'hello world',
    };
    const result = await scorer.score(tc);
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
  });

  it('respects normalize: false', async () => {
    const strict = exactMatch({ normalize: false });
    const tc: TestCase<string, string> = {
      id: 'strict-1',
      input: 'question',
      output: '  Hello World  ',
      expected: 'Hello World',
    };
    const result = await strict.score(tc);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('ignores punctuation when option is set', async () => {
    const scorer = exactMatch({ ignorePunctuation: true });
    const tc: TestCase<string, string> = {
      id: 'punct-1',
      input: 'question',
      output: 'hello, world!',
      expected: 'hello world',
    };
    const result = await scorer.score(tc);
    expect(result.score).toBe(1);
  });

  it('returns error when expected is undefined', async () => {
    const tc: TestCase<string, string> = {
      id: 'no-expected',
      input: 'question',
      output: 'hello',
    };
    const result = await scorer.score(tc);
    expect(result.error).toBeDefined();
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('reports first divergence point in reason', async () => {
    const tc: TestCase<string, string> = {
      id: 'diverge-1',
      input: 'question',
      output: 'hello world',
      expected: 'hello mars',
    };
    const result = await scorer.score(tc);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('index');
  });

  it('tracks latencyMs', async () => {
    const tc: TestCase<string, string> = {
      id: 'latency-1',
      input: 'question',
      output: 'test',
      expected: 'test',
    };
    const result = await scorer.score(tc);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/exact-match.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write src/scorers/exact-match.ts**

```ts
import { ScorerError } from '../errors.js';
import type { Scorer, ScoreResult, TestCase } from '../types.js';

interface ExactMatchOptions {
  /** Trim, collapse whitespace, and lowercase before comparing. Default: true. */
  readonly normalize?: boolean;
  /** Strip punctuation before comparing. Default: false. */
  readonly ignorePunctuation?: boolean;
}

function normalizeText(text: string, options: ExactMatchOptions): string {
  let result = text;

  if (options.normalize !== false) {
    result = result.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  if (options.ignorePunctuation === true) {
    result = result.replace(/[^\w\s]/g, '');
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
  return 'Strings are identical';
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
    name: 'exactMatch',
    async score(testCase: TestCase): Promise<ScoreResult> {
      const start = performance.now();

      if (testCase.expected === undefined || testCase.expected === null) {
        const latencyMs = performance.now() - start;
        return {
          scorer: 'exactMatch',
          score: 0,
          passed: false,
          reason: 'exactMatch requires `expected` to be set on the test case.',
          error: new ScorerError(
            'exactMatch requires `expected` to be set on the test case.',
            { scorerName: 'exactMatch', caseId: testCase.id }
          ),
          latencyMs,
        };
      }

      const output = normalizeText(String(testCase.output), options);
      const expected = normalizeText(String(testCase.expected), options);
      const isMatch = output === expected;
      const latencyMs = performance.now() - start;

      return {
        scorer: 'exactMatch',
        score: isMatch ? 1 : 0,
        passed: isMatch,
        reason: isMatch ? 'Exact match.' : findFirstDivergence(output, expected),
        latencyMs,
      };
    },
  };
}
```

- [ ] **Step 4: Update src/index.ts — add exactMatch export**

```ts
export { exactMatch } from './scorers/exact-match.js';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test test/exact-match.test.ts
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/scorers/exact-match.ts test/exact-match.test.ts src/index.ts
git commit -m "feat(scorers): add exactMatch scorer

Deterministic string comparison with normalization and punctuation
options. Reports first divergence point on mismatch. Returns error
when expected is undefined."
```

---

### Task 4: Runner (Bounded Concurrency + Error Isolation)

**Files:**
- Create: `src/runner.ts`
- Create: `test/runner.test.ts`

**Interfaces:**
- Consumes: `TestCase`, `Scorer`, `ScoreResult`, `CaseReport`, `ProgressEvent` from `src/types.ts`; `ScorerError` from `src/errors.ts`
- Produces: `runCases(config)` function used by `suite.ts` in Task 5

- [ ] **Step 1: Write test/runner.test.ts**

```ts
import { describe, expect, it, vi } from 'vitest';
import { runCases } from '../src/runner.js';
import type { CaseReport, ProgressEvent, Scorer, TestCase } from '../src/types.js';

function makeCase(id: string): TestCase<string, string> {
  return { id, input: 'q', output: 'a', expected: 'a' };
}

function makeDelayScorer(name: string, delayMs: number, score = 1): Scorer {
  return {
    name,
    async score() {
      await new Promise((r) => setTimeout(r, delayMs));
      return { scorer: name, score, passed: score >= 0.5, reason: 'ok', latencyMs: delayMs };
    },
  };
}

function makeFailingScorer(name: string): Scorer {
  return {
    name,
    async score() {
      throw new Error(`${name} exploded`);
    },
  };
}

describe('runCases', () => {
  it('runs all cases and returns CaseReports in original order', async () => {
    const cases = [makeCase('c1'), makeCase('c2'), makeCase('c3')];
    const scorers = [makeDelayScorer('fast', 1)];
    const results = await runCases({ cases, scorers, concurrency: 2, passPolicy: 'all' });

    expect(results).toHaveLength(3);
    expect(results[0]?.testCase.id).toBe('c1');
    expect(results[1]?.testCase.id).toBe('c2');
    expect(results[2]?.testCase.id).toBe('c3');
  });

  it('respects bounded concurrency', async () => {
    let running = 0;
    let maxRunning = 0;

    const trackingScorer: Scorer = {
      name: 'tracker',
      async score() {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 100));
        running--;
        return { scorer: 'tracker', score: 1, passed: true, reason: 'ok', latencyMs: 100 };
      },
    };

    const cases = Array.from({ length: 8 }, (_, i) => makeCase(`c${i}`));
    await runCases({ cases, scorers: [trackingScorer], concurrency: 3, passPolicy: 'all' });

    expect(maxRunning).toBeLessThanOrEqual(3);
    expect(maxRunning).toBeGreaterThan(1); // actually ran concurrently
  });

  it('isolates scorer errors — other scorers and cases continue', async () => {
    const cases = [makeCase('c1'), makeCase('c2')];
    const scorers = [makeDelayScorer('good', 1), makeFailingScorer('bad')];
    const results = await runCases({ cases, scorers, concurrency: 4, passPolicy: 'all' });

    expect(results).toHaveLength(2);

    // Both cases have 2 results
    for (const report of results) {
      expect(report.results).toHaveLength(2);
      const goodResult = report.results.find((r) => r.scorer === 'good');
      const badResult = report.results.find((r) => r.scorer === 'bad');
      expect(goodResult?.score).toBe(1);
      expect(badResult?.error).toBeDefined();
      expect(badResult?.score).toBe(0);
    }
  });

  it('emits progress events', async () => {
    const events: ProgressEvent[] = [];
    const cases = [makeCase('c1'), makeCase('c2')];
    const scorers = [makeDelayScorer('s', 1)];

    await runCases({
      cases,
      scorers,
      concurrency: 1,
      passPolicy: 'all',
      onProgress: (e) => events.push(e),
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.completed).toBe(1);
    expect(events[0]?.total).toBe(2);
    expect(events[1]?.completed).toBe(2);
    expect(events[1]?.total).toBe(2);
  });

  it('determines case pass/fail based on passPolicy "all"', async () => {
    const cases = [makeCase('c1')];
    const scorers = [makeDelayScorer('pass', 1, 1), makeDelayScorer('fail', 1, 0)];
    const results = await runCases({ cases, scorers, concurrency: 4, passPolicy: 'all' });

    expect(results[0]?.passed).toBe(false); // 'fail' scorer didn't pass
  });

  it('determines case pass/fail based on passPolicy "any"', async () => {
    const cases = [makeCase('c1')];
    const scorers = [makeDelayScorer('pass', 1, 1), makeDelayScorer('fail', 1, 0)];
    const results = await runCases({ cases, scorers, concurrency: 4, passPolicy: 'any' });

    expect(results[0]?.passed).toBe(true); // at least one passed
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/runner.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write src/runner.ts**

```ts
import { ScorerError } from './errors.js';
import type { CaseReport, ProgressEvent, Scorer, ScoreResult, TestCase } from './types.js';

interface RunConfig<TInput = unknown, TExpected = unknown> {
  readonly cases: ReadonlyArray<TestCase<TInput, TExpected>>;
  readonly scorers: ReadonlyArray<Scorer<TInput, TExpected>>;
  readonly concurrency: number;
  readonly passPolicy: 'all' | 'any';
  readonly onProgress?: ((event: ProgressEvent) => void) | undefined;
}

/**
 * Scores a single test case with a single scorer, catching any thrown errors.
 * Errors are returned as ScoreResult.error, never propagated.
 */
async function scoreWithIsolation(
  scorer: Scorer,
  testCase: TestCase
): Promise<ScoreResult> {
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
        }
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
  passPolicy: 'all' | 'any'
): Promise<CaseReport> {
  const results = await Promise.all(
    scorers.map((scorer) => scoreWithIsolation(scorer, testCase))
  );

  const passed =
    passPolicy === 'all'
      ? results.every((r) => r.passed)
      : results.some((r) => r.passed);

  return { testCase, results, passed };
}

/**
 * Runs all test cases with bounded concurrency and error isolation.
 * Returns CaseReports in the original case order regardless of completion order.
 */
export async function runCases<TInput = unknown, TExpected = unknown>(config: RunConfig<TInput, TExpected>): Promise<CaseReport[]> {
  const { cases, scorers, concurrency, passPolicy, onProgress } = config;
  const results: CaseReport[] = new Array(cases.length);
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test test/runner.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/runner.ts test/runner.test.ts
git commit -m "feat: add bounded-concurrency runner with error isolation

Hand-rolled promise pool (no external deps). Per-scorer error
isolation — thrown errors captured as ScoreResult.error. Deterministic
output ordering. Progress event emission."
```

---

### Task 5: Suite (Config Validation + Report Assembly)

**Files:**
- Create: `src/suite.ts`
- Create: `test/suite.test.ts`
- Modify: `src/index.ts` (add defineSuite export)

**Interfaces:**
- Consumes: `SuiteConfig`, `Report`, `ReportSummary`, `CaseReport`, `ScoreResult` from `src/types.ts`; `suiteConfigSchema` from `src/types.ts`; `ConfigError` from `src/errors.ts`; `runCases` from `src/runner.ts`
- Produces: `defineSuite<TInput, TExpected>(config)` returning `Suite` with `run(): Promise<Report>`

- [ ] **Step 1: Write test/suite.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { ConfigError } from '../src/errors.js';
import { defineSuite } from '../src/suite.js';
import type { Scorer, TestCase } from '../src/types.js';

const passingScorer: Scorer = {
  name: 'always-pass',
  async score(tc) {
    return { scorer: 'always-pass', score: 1, passed: true, reason: 'pass', latencyMs: 1 };
  },
};

const failingScorer: Scorer = {
  name: 'always-fail',
  async score(tc) {
    return { scorer: 'always-fail', score: 0, passed: false, reason: 'fail', latencyMs: 1 };
  },
};

const makeCase = (id: string): TestCase => ({
  id,
  input: 'q',
  output: 'a',
  expected: 'a',
});

describe('defineSuite', () => {
  it('throws ConfigError for empty suite name', () => {
    expect(() =>
      defineSuite({ name: '', cases: [makeCase('c1')], scorers: [passingScorer] })
    ).toThrow(ConfigError);
  });

  it('throws ConfigError for empty cases', () => {
    expect(() =>
      defineSuite({ name: 'test', cases: [], scorers: [passingScorer] })
    ).toThrow(ConfigError);
  });

  it('throws ConfigError for empty scorers', () => {
    expect(() =>
      defineSuite({ name: 'test', cases: [makeCase('c1')], scorers: [] })
    ).toThrow(ConfigError);
  });

  it('creates a valid suite and runs it', async () => {
    const suite = defineSuite({
      name: 'test-suite',
      cases: [makeCase('c1'), makeCase('c2')],
      scorers: [passingScorer],
    });

    const report = await suite.run();

    expect(report.suite).toBe('test-suite');
    expect(report.cases).toHaveLength(2);
    expect(report.summary.total).toBe(2);
    expect(report.summary.passed).toBe(2);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.passRate).toBe(1);
    expect(report.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('computes byScorer statistics', async () => {
    const suite = defineSuite({
      name: 'stats-suite',
      cases: [makeCase('c1'), makeCase('c2')],
      scorers: [passingScorer, failingScorer],
    });

    const report = await suite.run();

    expect(report.summary.byScorer['always-pass']?.passRate).toBe(1);
    expect(report.summary.byScorer['always-pass']?.avgScore).toBe(1);
    expect(report.summary.byScorer['always-fail']?.passRate).toBe(0);
    expect(report.summary.byScorer['always-fail']?.avgScore).toBe(0);
  });

  it('uses passPolicy "all" by default', async () => {
    const suite = defineSuite({
      name: 'policy-test',
      cases: [makeCase('c1')],
      scorers: [passingScorer, failingScorer],
    });

    const report = await suite.run();
    expect(report.cases[0]?.passed).toBe(false); // one failed, so case fails
    expect(report.summary.passed).toBe(0);
  });

  it('supports passPolicy "any"', async () => {
    const suite = defineSuite({
      name: 'policy-any',
      cases: [makeCase('c1')],
      scorers: [passingScorer, failingScorer],
      passPolicy: 'any',
    });

    const report = await suite.run();
    expect(report.cases[0]?.passed).toBe(true); // one passed
    expect(report.summary.passed).toBe(1);
  });

  it('counts errored cases correctly', async () => {
    const errorScorer: Scorer = {
      name: 'error-scorer',
      async score() {
        throw new Error('boom');
      },
    };

    const suite = defineSuite({
      name: 'error-suite',
      cases: [makeCase('c1'), makeCase('c2')],
      scorers: [passingScorer, errorScorer],
    });

    const report = await suite.run();
    expect(report.summary.errored).toBe(2); // both cases have an errored scorer
    expect(report.summary.passed).toBe(0); // passPolicy 'all' — error means not passed
  });

  it('defaults concurrency to 4', async () => {
    const suite = defineSuite({
      name: 'concurrency-test',
      cases: [makeCase('c1')],
      scorers: [passingScorer],
    });

    // Just verifying it runs without error at default concurrency
    const report = await suite.run();
    expect(report.summary.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/suite.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write src/suite.ts**

```ts
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
```

- [ ] **Step 4: Update src/index.ts — add defineSuite export**

```ts
export { defineSuite } from './suite.js';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test test/suite.test.ts
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/suite.ts test/suite.test.ts src/index.ts
git commit -m "feat: add defineSuite with zod validation and report assembly

Validates config at construction (throws ConfigError). Delegates
execution to runner. Assembles Report with summary stats including
byScorer breakdown, pass/fail/errored counts, and avgLatencyMs."
```

---

### Task 6: Console + JSON Reporters

**Files:**
- Create: `src/reporters/console.ts`
- Create: `src/reporters/json.ts`
- Create: `test/reporters/console.test.ts`
- Create: `test/reporters/json.test.ts`
- Modify: `src/index.ts` (add reporter exports)

**Interfaces:**
- Consumes: `Report`, `CaseReport`, `ScoreResult`, `Reporter` from `src/types.ts`
- Produces: `consoleReporter(options?)` and `jsonReporter(path)` factory functions returning `Reporter`

- [ ] **Step 1: Write test/reporters/console.test.ts**

```ts
import { describe, expect, it, vi } from 'vitest';
import { consoleReporter } from '../../src/reporters/console.js';
import type { Report } from '../../src/types.js';

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    suite: 'test-suite',
    startedAt: '2026-06-25T10:00:00.000Z',
    finishedAt: '2026-06-25T10:00:01.000Z',
    cases: [
      {
        testCase: { id: 'c1', input: 'q', output: 'a', expected: 'a' },
        results: [
          { scorer: 'exactMatch', score: 1, passed: true, reason: 'Exact match.', latencyMs: 1 },
        ],
        passed: true,
      },
      {
        testCase: { id: 'c2', input: 'q', output: 'b', expected: 'a' },
        results: [
          {
            scorer: 'exactMatch',
            score: 0,
            passed: false,
            reason: 'Strings differ at index 0',
            latencyMs: 1,
          },
        ],
        passed: false,
      },
    ],
    summary: {
      total: 2,
      passed: 1,
      failed: 1,
      errored: 0,
      passRate: 0.5,
      byScorer: { exactMatch: { passRate: 0.5, avgScore: 0.5 } },
      avgLatencyMs: 1,
    },
    ...overrides,
  };
}

describe('consoleReporter', () => {
  it('writes formatted output to stdout', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const reporter = consoleReporter();
    reporter(makeReport());

    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('test-suite');
    expect(output).toContain('c1');
    expect(output).toContain('c2');
    expect(output).toContain('PASS');
    expect(output).toContain('FAIL');
    expect(output).toContain('50.0%');

    writeSpy.mockRestore();
  });

  it('shows failed case reasons', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const reporter = consoleReporter();
    reporter(makeReport());

    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('Strings differ at index 0');

    writeSpy.mockRestore();
  });

  it('shows verbose detail when verbose: true', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const reporter = consoleReporter({ verbose: true });
    reporter(makeReport());

    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    // Verbose-only content: detailed per-case breakdown with score= and reason=
    expect(output).toContain('Detailed Results');
    expect(output).toContain('score=');
    expect(output).toContain('reason=');

    writeSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Write test/reporters/json.test.ts**

```ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { jsonReporter } from '../../src/reporters/json.js';
import type { Report } from '../../src/types.js';

function makeReport(): Report {
  return {
    suite: 'test-suite',
    startedAt: '2026-06-25T10:00:00.000Z',
    finishedAt: '2026-06-25T10:00:01.000Z',
    cases: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      errored: 0,
      passRate: 0,
      byScorer: {},
      avgLatencyMs: 0,
    },
  };
}

describe('jsonReporter', () => {
  const tmpDir = path.join(os.tmpdir(), `evalkit-test-${Date.now()}`);

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('writes valid JSON to the specified path', async () => {
    const filePath = path.join(tmpDir, 'report.json');
    const reporter = jsonReporter(filePath);
    await reporter(makeReport());

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.suite).toBe('test-suite');
  });

  it('creates parent directories if they do not exist', async () => {
    const filePath = path.join(tmpDir, 'nested', 'deep', 'report.json');
    const reporter = jsonReporter(filePath);
    await reporter(makeReport());

    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('writes well-formatted JSON (2-space indent)', async () => {
    const filePath = path.join(tmpDir, 'formatted.json');
    const reporter = jsonReporter(filePath);
    await reporter(makeReport());

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('  "suite"');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test test/reporters/
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Write src/reporters/console.ts**

```ts
import type { Report, Reporter } from '../types.js';

interface ConsoleReporterOptions {
  /** Show metadata and raw scorer detail for each case. Default: false. */
  readonly verbose?: boolean;
}

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Creates a reporter that outputs a formatted table to stdout.
 * Shows pass/fail status, scores, and reasons for failed cases.
 *
 * @param options - Display options.
 * @returns A Reporter function.
 */
export function consoleReporter(options: ConsoleReporterOptions = {}): Reporter {
  return (report: Report): void => {
    const lines: string[] = [];

    lines.push('');
    lines.push(`${BOLD}Suite: ${report.suite}${RESET}`);
    lines.push(`${DIM}${report.startedAt} → ${report.finishedAt}${RESET}`);
    lines.push('');

    // Header
    const scorerNames = Object.keys(report.summary.byScorer);
    const headerCols = ['Case', ...scorerNames, 'Status'];
    lines.push(headerCols.map((c) => c.padEnd(16)).join('│ '));
    lines.push('─'.repeat(headerCols.length * 18));

    // Rows
    for (const caseReport of report.cases) {
      const cols: string[] = [caseReport.testCase.id.padEnd(16)];

      for (const name of scorerNames) {
        const result = caseReport.results.find((r) => r.scorer === name);
        if (result) {
          const color = result.passed ? GREEN : RED;
          const icon = result.passed ? '\u2713' : '\u2717';
          cols.push(`${color}${result.score.toFixed(2)} ${icon}${RESET}`.padEnd(25));
        } else {
          cols.push(`${DIM}---${RESET}`.padEnd(25));
        }
      }

      const statusColor = caseReport.passed ? GREEN : RED;
      const statusText = caseReport.passed ? 'PASS' : 'FAIL';
      cols.push(`${statusColor}${BOLD}${statusText}${RESET}`);

      lines.push(cols.join('│ '));
    }

    lines.push('');

    // Summary
    const { summary } = report;
    const passColor = summary.passRate >= 0.8 ? GREEN : summary.passRate >= 0.5 ? YELLOW : RED;
    lines.push(
      `${BOLD}Summary:${RESET} ${passColor}${summary.passed}/${summary.total} passed (${(summary.passRate * 100).toFixed(1)}%)${RESET} │ Avg latency: ${summary.avgLatencyMs.toFixed(1)}ms`
    );

    if (summary.errored > 0) {
      lines.push(`${YELLOW}  ${summary.errored} case(s) had scorer errors${RESET}`);
    }

    // Per-scorer stats
    for (const [name, stats] of Object.entries(summary.byScorer)) {
      lines.push(
        `  ${DIM}${name}: ${(stats.passRate * 100).toFixed(1)}% pass, avg ${stats.avgScore.toFixed(2)}${RESET}`
      );
    }

    // Failed cases detail
    const failedCases = report.cases.filter((c) => !c.passed);
    if (failedCases.length > 0) {
      lines.push('');
      lines.push(`${RED}${BOLD}Failed cases:${RESET}`);
      for (const fc of failedCases) {
        const failedResults = fc.results.filter((r) => !r.passed);
        for (const r of failedResults) {
          lines.push(`  ${fc.testCase.id} → ${r.scorer}: ${DIM}${r.reason ?? 'no reason'}${RESET}`);
        }
      }
    }

    // Verbose detail
    if (options.verbose) {
      lines.push('');
      lines.push(`${BOLD}Detailed Results:${RESET}`);
      for (const caseReport of report.cases) {
        lines.push(`  ${BOLD}${caseReport.testCase.id}${RESET}`);
        for (const r of caseReport.results) {
          lines.push(`    ${r.scorer}: score=${r.score.toFixed(2)} passed=${r.passed} reason="${r.reason ?? ''}" latency=${r.latencyMs.toFixed(1)}ms`);
        }
        if (caseReport.testCase.metadata) {
          lines.push(`    ${DIM}metadata: ${JSON.stringify(caseReport.testCase.metadata)}${RESET}`);
        }
      }
    }

    lines.push('');
    process.stdout.write(lines.join('\n'));
  };
}
```

- [ ] **Step 5: Write src/reporters/json.ts**

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Report, Reporter } from '../types.js';

/**
 * Creates a reporter that writes the full Report as formatted JSON to a file.
 * Auto-creates parent directories if they don't exist.
 *
 * @param filePath - Absolute or relative path to the output JSON file.
 * @returns An async Reporter function.
 */
export function jsonReporter(filePath: string): Reporter {
  return async (report: Report): Promise<void> => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const json = JSON.stringify(report, null, 2);
    fs.writeFileSync(filePath, json, 'utf-8');
  };
}
```

- [ ] **Step 6: Update src/index.ts — add reporter exports**

```ts
export { consoleReporter } from './reporters/console.js';
export { jsonReporter } from './reporters/json.js';
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm test test/reporters/
```

Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add src/reporters/ test/reporters/ src/index.ts
git commit -m "feat: add console and JSON reporters

consoleReporter: colored table with pass/fail, per-scorer stats,
failed case reasons, optional verbose mode.
jsonReporter: writes Report JSON to file, auto-creates parent dirs."
```

---

### Task 7: semanticSimilarity Scorer

**Files:**
- Create: `src/scorers/semantic-similarity.ts`
- Create: `test/semantic-similarity.test.ts`
- Modify: `src/index.ts` (add export)

**Interfaces:**
- Consumes: `TestCase`, `Scorer`, `ScoreResult`, `EmbeddingAdapter` from `src/types.ts`; `ScorerError`, `AdapterError` from `src/errors.ts`
- Produces: `semanticSimilarity(options)` factory function returning `Scorer`

- [ ] **Step 1: Write test/semantic-similarity.test.ts**

```ts
import { describe, expect, it, vi } from 'vitest';
import { semanticSimilarity } from '../src/scorers/semantic-similarity.js';
import type { EmbeddingAdapter, TestCase } from '../src/types.js';

// Mock adapter returning known vectors
function mockEmbedder(vectors: number[][]): EmbeddingAdapter {
  return {
    async embed(texts) {
      return texts.map((_, i) => vectors[i] ?? vectors[0]!);
    },
  };
}

describe('semanticSimilarity', () => {
  it('returns score 1.0 for identical vectors', async () => {
    const adapter = mockEmbedder([
      [1, 0, 0],
      [1, 0, 0],
    ]);
    const scorer = semanticSimilarity({ embed: adapter });
    const tc: TestCase<string, string> = {
      id: 'identical',
      input: 'q',
      output: 'hello',
      expected: 'hello',
    };
    const result = await scorer.score(tc);
    expect(result.score).toBeCloseTo(1.0);
    expect(result.passed).toBe(true);
  });

  it('returns score 0.0 for orthogonal vectors', async () => {
    const adapter = mockEmbedder([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    const scorer = semanticSimilarity({ embed: adapter });
    const tc: TestCase<string, string> = {
      id: 'orthogonal',
      input: 'q',
      output: 'hello',
      expected: 'world',
    };
    const result = await scorer.score(tc);
    expect(result.score).toBeCloseTo(0.0);
    expect(result.passed).toBe(false);
  });

  it('uses custom threshold', async () => {
    const adapter = mockEmbedder([
      [1, 1, 0],
      [1, 0, 0],
    ]); // cosine ~0.707
    const scorer = semanticSimilarity({ embed: adapter, threshold: 0.5 });
    const tc: TestCase<string, string> = {
      id: 'threshold',
      input: 'q',
      output: 'a',
      expected: 'b',
    };
    const result = await scorer.score(tc);
    expect(result.passed).toBe(true); // 0.707 >= 0.5
  });

  it('returns error when expected is undefined', async () => {
    const adapter = mockEmbedder([[1, 0, 0]]);
    const scorer = semanticSimilarity({ embed: adapter });
    const tc: TestCase<string, string> = { id: 'no-expected', input: 'q', output: 'hello' };
    const result = await scorer.score(tc);
    expect(result.error).toBeDefined();
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('handles adapter errors gracefully', async () => {
    const failAdapter: EmbeddingAdapter = {
      async embed() {
        throw new Error('API rate limit');
      },
    };
    const scorer = semanticSimilarity({ embed: failAdapter });
    const tc: TestCase<string, string> = {
      id: 'adapter-fail',
      input: 'q',
      output: 'hello',
      expected: 'world',
    };
    const result = await scorer.score(tc);
    expect(result.error).toBeDefined();
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('handles zero vectors', async () => {
    const adapter = mockEmbedder([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    const scorer = semanticSimilarity({ embed: adapter });
    const tc: TestCase<string, string> = {
      id: 'zero-vector',
      input: 'q',
      output: 'hello',
      expected: 'world',
    };
    const result = await scorer.score(tc);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('zero');
  });

  it('handles dimension mismatch', async () => {
    const adapter: EmbeddingAdapter = {
      async embed() {
        return [[1, 0, 0], [1, 0]]; // different dimensions
      },
    };
    const scorer = semanticSimilarity({ embed: adapter });
    const tc: TestCase<string, string> = {
      id: 'dim-mismatch',
      input: 'q',
      output: 'hello',
      expected: 'world',
    };
    const result = await scorer.score(tc);
    expect(result.error).toBeDefined();
  });

  it('caches identical strings', async () => {
    const embedCalls: string[][] = [];
    const cachingAdapter: EmbeddingAdapter = {
      async embed(texts) {
        embedCalls.push([...texts]);
        return texts.map(() => [1, 0, 0]);
      },
    };
    const scorer = semanticSimilarity({ embed: cachingAdapter });

    // Same output and expected
    const tc: TestCase<string, string> = {
      id: 'cache-test',
      input: 'q',
      output: 'identical',
      expected: 'identical',
    };
    await scorer.score(tc);

    // When both strings are identical, only one unique text needs embedding
    // The adapter receives both but result should still be correct
    expect(embedCalls.length).toBe(1);
  });

  it('tracks latencyMs', async () => {
    const adapter = mockEmbedder([
      [1, 0, 0],
      [1, 0, 0],
    ]);
    const scorer = semanticSimilarity({ embed: adapter });
    const tc: TestCase<string, string> = {
      id: 'latency',
      input: 'q',
      output: 'hello',
      expected: 'hello',
    };
    const result = await scorer.score(tc);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/semantic-similarity.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write src/scorers/semantic-similarity.ts**

```ts
import { AdapterError, ScorerError } from '../errors.js';
import type { EmbeddingAdapter, Scorer, ScoreResult, TestCase } from '../types.js';

interface SemanticSimilarityOptions {
  /** The embedding adapter to use. */
  readonly embed: EmbeddingAdapter;
  /** Cosine similarity threshold for passing. Default: 0.8. */
  readonly threshold?: number;
}

function cosineSimilarity(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dot += aVal * bVal;
    magA += aVal * aVal;
    magB += bVal * bVal;
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;
  return dot / magnitude;
}

/**
 * Creates a semantic similarity scorer using cosine similarity of embeddings.
 * Requires the user to inject an EmbeddingAdapter for their provider.
 *
 * @param options - Embedding adapter and threshold configuration.
 * @returns A Scorer instance.
 */
export function semanticSimilarity(options: SemanticSimilarityOptions): Scorer {
  const threshold = options.threshold ?? 0.8;
  const cache = new Map<string, ReadonlyArray<number>>();

  return {
    name: 'semanticSimilarity',
    async score(testCase: TestCase): Promise<ScoreResult> {
      const start = performance.now();

      if (testCase.expected === undefined || testCase.expected === null) {
        return {
          scorer: 'semanticSimilarity',
          score: 0,
          passed: false,
          reason: 'semanticSimilarity requires `expected` to be set on the test case.',
          error: new ScorerError(
            'semanticSimilarity requires `expected` to be set on the test case.',
            { scorerName: 'semanticSimilarity', caseId: testCase.id }
          ),
          latencyMs: performance.now() - start,
        };
      }

      const outputStr = String(testCase.output);
      const expectedStr = String(testCase.expected);

      try {
        // Deduplicate texts for embedding
        const uniqueTexts = [...new Set([outputStr, expectedStr])];
        const textsToEmbed = uniqueTexts.filter((t) => !cache.has(t));

        if (textsToEmbed.length > 0) {
          const vectors = await options.embed.embed(textsToEmbed);
          for (let i = 0; i < textsToEmbed.length; i++) {
            const text = textsToEmbed[i]!;
            const vector = vectors[i];
            if (vector) {
              cache.set(text, vector);
            }
          }
        }

        const outputVec = cache.get(outputStr);
        const expectedVec = cache.get(expectedStr);

        if (!outputVec || !expectedVec) {
          return {
            scorer: 'semanticSimilarity',
            score: 0,
            passed: false,
            reason: 'Failed to retrieve embedding vectors.',
            error: new AdapterError('Embedding adapter returned no vectors', {
              adapterType: 'embedding',
            }),
            latencyMs: performance.now() - start,
          };
        }

        // Validate dimensions
        if (outputVec.length !== expectedVec.length) {
          return {
            scorer: 'semanticSimilarity',
            score: 0,
            passed: false,
            reason: `Vector dimension mismatch: output has ${outputVec.length} dims, expected has ${expectedVec.length} dims.`,
            error: new AdapterError(
              `Vector dimension mismatch: ${outputVec.length} vs ${expectedVec.length}`,
              { adapterType: 'embedding' }
            ),
            latencyMs: performance.now() - start,
          };
        }

        // Check for zero vectors
        const outputMag = outputVec.reduce((sum, v) => sum + v * v, 0);
        const expectedMag = expectedVec.reduce((sum, v) => sum + v * v, 0);

        if (outputMag === 0 || expectedMag === 0) {
          return {
            scorer: 'semanticSimilarity',
            score: 0,
            passed: false,
            reason: 'Cannot compute cosine similarity: zero-magnitude vector detected.',
            latencyMs: performance.now() - start,
          };
        }

        const similarity = cosineSimilarity(outputVec, expectedVec);
        const clampedScore = Math.max(0, Math.min(1, similarity));
        const passed = clampedScore >= threshold;

        return {
          scorer: 'semanticSimilarity',
          score: clampedScore,
          passed,
          reason: `Cosine similarity: ${clampedScore.toFixed(4)} (threshold: ${threshold}).`,
          latencyMs: performance.now() - start,
        };
      } catch (err) {
        return {
          scorer: 'semanticSimilarity',
          score: 0,
          passed: false,
          reason: `Embedding failed: ${err instanceof Error ? err.message : String(err)}`,
          error: new AdapterError(
            `Embedding adapter failed: ${err instanceof Error ? err.message : String(err)}`,
            {
              adapterType: 'embedding',
              cause: err instanceof Error ? err : undefined,
            }
          ),
          latencyMs: performance.now() - start,
        };
      }
    },
  };
}
```

- [ ] **Step 4: Update src/index.ts — add semanticSimilarity export**

```ts
export { semanticSimilarity } from './scorers/semantic-similarity.js';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test test/semantic-similarity.test.ts
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/scorers/semantic-similarity.ts test/semantic-similarity.test.ts src/index.ts
git commit -m "feat(scorers): add semanticSimilarity scorer

Cosine similarity of embeddings via injected adapter. Batches texts,
validates dimensions, guards zero-vectors, caches identical strings
per instance. Returns error when expected is undefined."
```

---

### Task 8: llmJudge Scorer

**Files:**
- Create: `src/scorers/llm-judge.ts`
- Create: `test/llm-judge.test.ts`
- Modify: `src/index.ts` (add export)

**Interfaces:**
- Consumes: `TestCase`, `Scorer`, `ScoreResult`, `ChatAdapter` from `src/types.ts`; `JudgeParseError`, `AdapterError`, `ScorerError` from `src/errors.ts`
- Produces: `llmJudge(options)` factory function returning `Scorer`

- [ ] **Step 1: Write test/llm-judge.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { llmJudge } from '../src/scorers/llm-judge.js';
import type { ChatAdapter, TestCase } from '../src/types.js';

function mockChat(response: string): ChatAdapter {
  return {
    async complete() {
      return { content: response };
    },
  };
}

function mockChatSequence(responses: string[]): ChatAdapter {
  let callIndex = 0;
  return {
    async complete() {
      const response = responses[callIndex] ?? responses[responses.length - 1]!;
      callIndex++;
      return { content: response };
    },
  };
}

const validResponse = JSON.stringify({ reasoning: 'Good answer', score: 4 });

const makeCase = (): TestCase<string, string> => ({
  id: 'judge-1',
  input: 'What is 2+2?',
  output: 'The answer is 4.',
  expected: 'Correct and concise.',
});

describe('llmJudge', () => {
  it('parses valid JSON response and normalizes score', async () => {
    const scorer = llmJudge({
      model: mockChat(validResponse),
      rubric: 'Is the answer correct?',
    });
    const result = await scorer.score(makeCase());

    expect(result.score).toBeCloseTo(0.75); // (4-1)/(5-1) = 0.75
    expect(result.passed).toBe(true); // 0.75 >= 0.6 default threshold
    expect(result.reason).toBe('Good answer');
    expect(result.scorer).toBe('llmJudge');
  });

  it('normalizes with custom scale', async () => {
    const response = JSON.stringify({ reasoning: 'ok', score: 7 });
    const scorer = llmJudge({
      model: mockChat(response),
      rubric: 'test',
      scale: { min: 1, max: 10 },
    });
    const result = await scorer.score(makeCase());
    expect(result.score).toBeCloseTo(0.667, 2); // (7-1)/(10-1) = 0.667
  });

  it('retries on malformed JSON and succeeds', async () => {
    const model = mockChatSequence([
      'I think the score is about 4', // malformed
      validResponse, // valid on retry
    ]);
    const scorer = llmJudge({ model, rubric: 'test', retries: 2 });
    const result = await scorer.score(makeCase());

    expect(result.score).toBeCloseTo(0.75);
    expect(result.error).toBeUndefined();
  });

  it('returns error after all retries exhausted', async () => {
    const model = mockChat('This is not JSON at all');
    const scorer = llmJudge({ model, rubric: 'test', retries: 1 });
    const result = await scorer.score(makeCase());

    expect(result.error).toBeDefined();
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('returns error when adapter throws', async () => {
    const failModel: ChatAdapter = {
      async complete() {
        throw new Error('API timeout');
      },
    };
    const scorer = llmJudge({ model: failModel, rubric: 'test' });
    const result = await scorer.score(makeCase());

    expect(result.error).toBeDefined();
    expect(result.score).toBe(0);
  });

  it('exposes full prompt on raw', async () => {
    const scorer = llmJudge({
      model: mockChat(validResponse),
      rubric: 'Is it good?',
    });
    const result = await scorer.score(makeCase());

    expect(result.raw).toBeDefined();
    const raw = result.raw as { system: string; userMessage: string; response: string };
    expect(raw.system).toContain('Is it good?');
    expect(raw.userMessage).toContain('What is 2+2?');
    expect(raw.response).toBe(validResponse);
  });

  it('uses temperature 0 by default', async () => {
    let capturedTemp: number | undefined;
    const model: ChatAdapter = {
      async complete(params) {
        capturedTemp = params.temperature;
        return { content: validResponse };
      },
    };
    const scorer = llmJudge({ model, rubric: 'test' });
    await scorer.score(makeCase());

    expect(capturedTemp).toBe(0);
  });

  it('respects custom threshold', async () => {
    const response = JSON.stringify({ reasoning: 'ok', score: 2 });
    const scorer = llmJudge({
      model: mockChat(response),
      rubric: 'test',
      threshold: 0.9, // (2-1)/(5-1) = 0.25 < 0.9
    });
    const result = await scorer.score(makeCase());

    expect(result.passed).toBe(false);
  });

  it('respects references option — only sends specified fields', async () => {
    let capturedMessages: unknown;
    const model: ChatAdapter = {
      async complete(params) {
        capturedMessages = params.messages;
        return { content: validResponse };
      },
    };

    const scorer = llmJudge({
      model,
      rubric: 'test',
      references: ['expected'], // only expected, not input
    });
    await scorer.score(makeCase());

    const msgs = capturedMessages as Array<{ content: string }>;
    const userMsg = msgs.find((m) => true)!.content;
    expect(userMsg).toContain('Correct and concise');
    expect(userMsg).not.toContain('What is 2+2?');
  });

  it('tracks latencyMs', async () => {
    const scorer = llmJudge({
      model: mockChat(validResponse),
      rubric: 'test',
    });
    const result = await scorer.score(makeCase());
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/llm-judge.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write src/scorers/llm-judge.ts**

```ts
import { z } from 'zod';
import { AdapterError, JudgeParseError } from '../errors.js';
import type { ChatAdapter, Scorer, ScoreResult, TestCase } from '../types.js';

interface LlmJudgeOptions {
  /** The chat adapter to use for judge calls. */
  readonly model: ChatAdapter;
  /** What "good" means, in plain language. */
  readonly rubric: string;
  /** The scoring scale. Default: { min: 1, max: 5 }. */
  readonly scale?: { min: number; max: number };
  /** Normalized pass threshold. Default: 0.6. */
  readonly threshold?: number;
  /** Which test case fields to show the judge. Default: ['expected', 'input']. */
  readonly references?: ReadonlyArray<'expected' | 'input'>;
  /** Max retries for malformed judge output. Default: 2. */
  readonly retries?: number;
}

const judgeResponseSchema = z.object({
  reasoning: z.string(),
  score: z.number(),
});

function buildSystemPrompt(rubric: string, scale: { min: number; max: number }): string {
  return `You are an evaluation judge. Your task is to evaluate an LLM output against a rubric.

RUBRIC: ${rubric}

SCORING SCALE: ${scale.min} (worst) to ${scale.max} (best)

You MUST respond with ONLY a JSON object in this exact format:
{
  "reasoning": "Your step-by-step reasoning about the output quality BEFORE deciding on a score",
  "score": <number between ${scale.min} and ${scale.max}>
}

IMPORTANT:
- Think through your reasoning FIRST, then decide on the score
- The "reasoning" field must come before "score" in your response
- Do not include any text outside the JSON object
- The score must be a number between ${scale.min} and ${scale.max}`;
}

function buildUserMessage(
  testCase: TestCase,
  references: ReadonlyArray<'expected' | 'input'>
): string {
  const parts: string[] = [];

  if (references.includes('input')) {
    parts.push(`INPUT: ${String(testCase.input)}`);
  }

  parts.push(`OUTPUT (to evaluate): ${testCase.output}`);

  if (references.includes('expected') && testCase.expected !== undefined) {
    parts.push(`REFERENCE/EXPECTED: ${String(testCase.expected)}`);
  }

  return parts.join('\n\n');
}

/**
 * Creates an LLM-as-judge scorer that evaluates outputs using a rubric.
 * Forces structured JSON output with reasoning-before-score to reduce bias.
 *
 * @param options - Judge configuration including model adapter and rubric.
 * @returns A Scorer instance.
 */
export function llmJudge(options: LlmJudgeOptions): Scorer {
  const scale = options.scale ?? { min: 1, max: 5 };
  const threshold = options.threshold ?? 0.6;
  const references = options.references ?? ['expected', 'input'];
  const maxRetries = options.retries ?? 2;

  return {
    name: 'llmJudge',
    async score(testCase: TestCase): Promise<ScoreResult> {
      const start = performance.now();

      const system = buildSystemPrompt(options.rubric, scale);
      const userMessage = buildUserMessage(testCase, references);

      let lastResponse = '';
      let messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: userMessage },
      ];

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await options.model.complete({
            system,
            messages,
            temperature: 0,
          });

          lastResponse = response.content;

          // Try to extract JSON from the response
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            // Add corrective message for retry
            messages = [
              ...messages,
              { role: 'assistant', content: response.content },
              {
                role: 'user',
                content:
                  'Your response was not valid JSON. Please respond with ONLY a JSON object: { "reasoning": "...", "score": <number> }',
              },
            ];
            continue;
          }

          const parsed = judgeResponseSchema.safeParse(JSON.parse(jsonMatch[0]));
          if (!parsed.success) {
            messages = [
              ...messages,
              { role: 'assistant', content: response.content },
              {
                role: 'user',
                content: `Your JSON was malformed: ${parsed.error.message}. Please respond with ONLY: { "reasoning": "...", "score": <number between ${scale.min} and ${scale.max}> }`,
              },
            ];
            continue;
          }

          // Normalize score to 0..1
          const rawScore = parsed.data.score;
          const clamped = Math.max(scale.min, Math.min(scale.max, rawScore));
          const normalized = (clamped - scale.min) / (scale.max - scale.min);
          const passed = normalized >= threshold;

          return {
            scorer: 'llmJudge',
            score: normalized,
            passed,
            reason: parsed.data.reasoning,
            raw: { system, userMessage, response: response.content },
            latencyMs: performance.now() - start,
          };
        } catch (err) {
          // Adapter-level error (network, timeout, etc.)
          if (attempt === maxRetries) {
            return {
              scorer: 'llmJudge',
              score: 0,
              passed: false,
              reason: `Judge adapter failed: ${err instanceof Error ? err.message : String(err)}`,
              error: new AdapterError(
                `Chat adapter failed after ${attempt + 1} attempt(s)`,
                {
                  adapterType: 'chat',
                  cause: err instanceof Error ? err : undefined,
                }
              ),
              raw: { system, userMessage, response: lastResponse },
              latencyMs: performance.now() - start,
            };
          }
          // Continue to retry on adapter errors too
          continue;
        }
      }

      // All retries exhausted for parse errors
      return {
        scorer: 'llmJudge',
        score: 0,
        passed: false,
        reason: `Judge returned unparseable response after ${maxRetries + 1} attempt(s).`,
        error: new JudgeParseError(
          `Failed to parse judge response after ${maxRetries + 1} attempts`,
          { rawResponse: lastResponse, retriesAttempted: maxRetries }
        ),
        raw: { system, userMessage, response: lastResponse },
        latencyMs: performance.now() - start,
      };
    },
  };
}
```

- [ ] **Step 4: Update src/index.ts — add llmJudge export**

```ts
export { llmJudge } from './scorers/llm-judge.js';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test test/llm-judge.test.ts
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/scorers/llm-judge.ts test/llm-judge.test.ts src/index.ts
git commit -m "feat(scorers): add llmJudge scorer with structured output parsing

Forces reasoning-before-score to reduce anchoring bias. Parses
JSON with zod, retries with corrective messages on parse failure.
Normalizes score to 0..1. Exposes full prompt on raw for inspection.
Temperature 0 default. Error-as-value on all failure paths."
```

---

### Task 9: composite Scorer

**Files:**
- Create: `src/scorers/composite.ts`
- Create: `test/composite.test.ts`
- Modify: `src/index.ts` (add export)

**Interfaces:**
- Consumes: `TestCase`, `Scorer`, `ScoreResult` from `src/types.ts`; `ConfigError`, `ScorerError` from `src/errors.js`
- Produces: `composite(options)` factory function returning `Scorer`

- [ ] **Step 1: Write test/composite.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { ConfigError } from '../src/errors.js';
import { composite } from '../src/scorers/composite.js';
import type { Scorer } from '../src/types.js';

function mockScorer(name: string, score: number, passed?: boolean): Scorer {
  return {
    name,
    async score() {
      return {
        scorer: name,
        score,
        passed: passed ?? score >= 0.5,
        reason: `${name} scored ${score}`,
        latencyMs: 1,
      };
    },
  };
}

function errorScorer(name: string): Scorer {
  return {
    name,
    async score() {
      throw new Error(`${name} failed`);
    },
  };
}

describe('composite', () => {
  it('computes weighted average of inner scorers', async () => {
    const scorer = composite({
      scorers: [mockScorer('a', 1.0), mockScorer('b', 0.5)],
      weights: [0.3, 0.7],
    });
    const result = await scorer.score({ id: 'c1', input: 'q', output: 'a', expected: 'a' });

    // 1.0 * 0.3 + 0.5 * 0.7 = 0.65
    expect(result.score).toBeCloseTo(0.65);
    expect(result.passed).toBe(true); // 0.65 >= 0.6 default
  });

  it('uses custom threshold', async () => {
    const scorer = composite({
      scorers: [mockScorer('a', 0.5), mockScorer('b', 0.5)],
      weights: [0.5, 0.5],
      threshold: 0.8,
    });
    const result = await scorer.score({ id: 'c1', input: 'q', output: 'a', expected: 'a' });

    expect(result.score).toBeCloseTo(0.5);
    expect(result.passed).toBe(false); // 0.5 < 0.8
  });

  it('throws ConfigError if weights do not sum to 1.0', () => {
    expect(() =>
      composite({
        scorers: [mockScorer('a', 1), mockScorer('b', 1)],
        weights: [0.3, 0.3], // sums to 0.6
      })
    ).toThrow(ConfigError);
  });

  it('throws ConfigError if scorers and weights length mismatch', () => {
    expect(() =>
      composite({
        scorers: [mockScorer('a', 1), mockScorer('b', 1)],
        weights: [0.5], // only one weight
      })
    ).toThrow(ConfigError);
  });

  it('redistributes weight when one scorer errors', async () => {
    const scorer = composite({
      scorers: [mockScorer('good', 0.8), errorScorer('bad')],
      weights: [0.5, 0.5],
    });
    const result = await scorer.score({ id: 'c1', input: 'q', output: 'a', expected: 'a' });

    // bad errored, so good gets all weight: 0.8 * 1.0 = 0.8
    expect(result.score).toBeCloseTo(0.8);
  });

  it('returns error with score 0 when ALL scorers error', async () => {
    const scorer = composite({
      scorers: [errorScorer('bad1'), errorScorer('bad2')],
      weights: [0.5, 0.5],
    });
    const result = await scorer.score({ id: 'c1', input: 'q', output: 'a', expected: 'a' });

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('includes per-scorer breakdown in reason', async () => {
    const scorer = composite({
      scorers: [mockScorer('exact', 1.0), mockScorer('judge', 0.8)],
      weights: [0.3, 0.7],
    });
    const result = await scorer.score({ id: 'c1', input: 'q', output: 'a', expected: 'a' });

    expect(result.reason).toContain('exact');
    expect(result.reason).toContain('judge');
    expect(result.reason).toContain('0.3');
    expect(result.reason).toContain('0.7');
  });

  it('has name "composite"', () => {
    const scorer = composite({
      scorers: [mockScorer('a', 1)],
      weights: [1.0],
    });
    expect(scorer.name).toBe('composite');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/composite.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write src/scorers/composite.ts**

```ts
import { ConfigError, ScorerError } from '../errors.js';
import type { Scorer, ScoreResult, TestCase } from '../types.js';

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
      `composite: scorers length (${scorers.length}) must match weights length (${weights.length}).`
    );
  }

  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (Math.abs(weightSum - 1.0) > WEIGHT_TOLERANCE) {
    throw new ConfigError(
      `composite: weights must sum to 1.0, but got ${weightSum.toFixed(4)}.`
    );
  }

  return {
    name: 'composite',
    async score(testCase: TestCase): Promise<ScoreResult> {
      const start = performance.now();

      // Run all inner scorers, catching errors
      const results: Array<{ result: ScoreResult; weight: number }> = [];
      for (let i = 0; i < scorers.length; i++) {
        const scorer = scorers[i]!;
        const weight = weights[i]!;

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
          scorer: 'composite',
          score: 0,
          passed: false,
          reason: `All ${errored.length} inner scorers errored.`,
          error: new ScorerError('All inner scorers in composite failed', {
            scorerName: 'composite',
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
        scorer: 'composite',
        score: weightedScore,
        passed,
        reason: breakdown.join(' | '),
        raw: results.map((r) => r.result),
        latencyMs: performance.now() - start,
      };
    },
  };
}
```

- [ ] **Step 4: Update src/index.ts — add composite export**

```ts
export { composite } from './scorers/composite.js';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test test/composite.test.ts
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/scorers/composite.ts test/composite.test.ts src/index.ts
git commit -m "feat(scorers): add composite scorer with weighted averaging

Validates weights sum to 1.0 at construction. Redistributes weight
proportionally on partial errors. Returns combined error when all
inner scorers fail. Per-scorer breakdown in reason."
```

---

### Task 10: Examples + CI + README

**Files:**
- Create: `examples/openai-adapter.ts`
- Create: `examples/anthropic-adapter.ts`
- Create: `examples/01-exact-match.ts`
- Create: `examples/02-semantic.ts`
- Create: `examples/03-llm-judge.ts`
- Create: `examples/04-composite.ts`
- Create: `examples/05-evaluating-rag-pipeline.ts`
- Create: `.github/workflows/ci.yml`
- Create: `CHANGELOG.md`
- Create: `README.md`

**Interfaces:**
- Consumes: All public exports from `src/index.ts`
- Produces: Complete public-facing project (README, examples, CI)

**Note:** Examples import from `'evalkit'` (the package name) for documentation purposes — this is what users will write. To run examples locally during development, either use `pnpm link` or create a `tsconfig.examples.json` with path mapping: `"paths": { "evalkit": ["./src/index.ts"] }`.

- [ ] **Step 1: Create examples/openai-adapter.ts**

```ts
import type { ChatAdapter, EmbeddingAdapter } from 'evalkit';

/**
 * Example OpenAI chat adapter.
 * Users must install `openai` package and provide their API key.
 *
 * Usage:
 *   import OpenAI from 'openai';
 *   const client = new OpenAI();
 *   const adapter = createOpenAIChatAdapter(client);
 */

interface OpenAIClient {
  chat: {
    completions: {
      create(params: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
      }): Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
  embeddings: {
    create(params: {
      model: string;
      input: string[];
    }): Promise<{ data: Array<{ embedding: number[] }> }>;
  };
}

export function createOpenAIChatAdapter(
  client: OpenAIClient,
  model = 'gpt-4o'
): ChatAdapter {
  return {
    async complete(params) {
      const messages: Array<{ role: string; content: string }> = [];

      if (params.system) {
        messages.push({ role: 'system', content: params.system });
      }

      for (const msg of params.messages) {
        messages.push({ role: msg.role, content: msg.content });
      }

      const response = await client.chat.completions.create({
        model,
        messages,
        temperature: params.temperature,
      });

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new Error('OpenAI returned empty response');
      }

      return { content };
    },
  };
}

export function createOpenAIEmbeddingAdapter(
  client: OpenAIClient,
  model = 'text-embedding-3-small'
): EmbeddingAdapter {
  return {
    async embed(texts) {
      const response = await client.embeddings.create({
        model,
        input: [...texts],
      });

      return response.data.map((d) => d.embedding);
    },
  };
}
```

- [ ] **Step 2: Create examples/anthropic-adapter.ts**

```ts
import type { ChatAdapter } from 'evalkit';

/**
 * Example Anthropic chat adapter.
 * Users must install `@anthropic-ai/sdk` and provide their API key.
 *
 * Usage:
 *   import Anthropic from '@anthropic-ai/sdk';
 *   const client = new Anthropic();
 *   const adapter = createAnthropicChatAdapter(client);
 */

interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
    }): Promise<{ content: Array<{ type: string; text: string }> }>;
  };
}

export function createAnthropicChatAdapter(
  client: AnthropicClient,
  model = 'claude-sonnet-4-6'
): ChatAdapter {
  return {
    async complete(params) {
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: params.system,
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: params.temperature,
      });

      const textBlock = response.content.find((c) => c.type === 'text');
      if (!textBlock) {
        throw new Error('Anthropic returned no text content');
      }

      return { content: textBlock.text };
    },
  };
}
```

- [ ] **Step 3: Create examples/01-exact-match.ts**

```ts
import { consoleReporter, defineSuite, exactMatch } from 'evalkit';

const suite = defineSuite({
  name: 'exact-match-demo',
  cases: [
    {
      id: 'greeting',
      input: 'Say hello',
      output: 'Hello, World!',
      expected: 'Hello, World!',
    },
    {
      id: 'math',
      input: 'What is 2+2?',
      output: 'The answer is 4',
      expected: 'the answer is 4',
    },
    {
      id: 'mismatch',
      input: 'Say goodbye',
      output: 'See you later!',
      expected: 'Goodbye!',
    },
  ],
  scorers: [exactMatch()],
});

const report = await suite.run();
consoleReporter()(report);
```

- [ ] **Step 4: Create examples/02-semantic.ts**

```ts
import { consoleReporter, defineSuite, semanticSimilarity } from 'evalkit';
import type { EmbeddingAdapter } from 'evalkit';

// Replace with your real embedding adapter (see openai-adapter.ts)
const mockEmbedAdapter: EmbeddingAdapter = {
  async embed(texts) {
    // In production, this calls your embedding provider
    // This mock returns random vectors for demonstration
    return texts.map(() => Array.from({ length: 3 }, () => Math.random()));
  },
};

const suite = defineSuite({
  name: 'semantic-similarity-demo',
  cases: [
    {
      id: 'paraphrase',
      input: 'Explain photosynthesis',
      output: 'Plants convert sunlight into energy through photosynthesis.',
      expected: 'Photosynthesis is the process by which plants use sunlight to make food.',
    },
  ],
  scorers: [semanticSimilarity({ embed: mockEmbedAdapter, threshold: 0.7 })],
});

const report = await suite.run();
consoleReporter()(report);
```

- [ ] **Step 5: Create examples/03-llm-judge.ts**

```ts
import { consoleReporter, defineSuite, llmJudge } from 'evalkit';
import type { ChatAdapter } from 'evalkit';

// Replace with your real chat adapter (see openai-adapter.ts or anthropic-adapter.ts)
const mockChatAdapter: ChatAdapter = {
  async complete() {
    return {
      content: JSON.stringify({
        reasoning: 'The response is empathetic and offers a concrete next step.',
        score: 4,
      }),
    };
  },
};

const suite = defineSuite({
  name: 'support-bot-tone',
  cases: [
    {
      id: 'refund-1',
      input: 'I want a refund now!!!',
      output:
        "I understand your frustration, and I'm sorry for the inconvenience. Let me look into your order right away and start the refund process. Can you share your order number?",
      expected: 'Empathetic, offers concrete next step, no false promises.',
    },
  ],
  scorers: [
    llmJudge({
      model: mockChatAdapter,
      rubric:
        'Response is empathetic, gives a concrete next step, and makes no commitment it cannot keep.',
    }),
  ],
});

const report = await suite.run();
consoleReporter({ verbose: true })(report);
```

- [ ] **Step 6: Create examples/04-composite.ts**

```ts
import { composite, consoleReporter, defineSuite, exactMatch, llmJudge } from 'evalkit';
import type { ChatAdapter } from 'evalkit';

const mockJudge: ChatAdapter = {
  async complete() {
    return {
      content: JSON.stringify({
        reasoning: 'Correct and well-structured answer.',
        score: 4,
      }),
    };
  },
};

const suite = defineSuite({
  name: 'composite-demo',
  cases: [
    {
      id: 'qa-1',
      input: 'What is the capital of France?',
      output: 'Paris',
      expected: 'Paris',
    },
  ],
  scorers: [
    composite({
      scorers: [
        exactMatch(),
        llmJudge({ model: mockJudge, rubric: 'Is the answer factually correct?' }),
      ],
      weights: [0.3, 0.7],
    }),
  ],
});

const report = await suite.run();
consoleReporter()(report);
```

- [ ] **Step 7: Create examples/05-evaluating-rag-pipeline.ts**

```ts
/**
 * Real-world use case: Evaluating a RAG pipeline for factual accuracy.
 *
 * This example shows how to evaluate whether a RAG system:
 * 1. Retrieved relevant context (semantic similarity)
 * 2. Generated a factually accurate answer (LLM judge)
 *
 * Uses composite scorer to combine both signals with appropriate weights.
 */
import { composite, consoleReporter, defineSuite, llmJudge, semanticSimilarity } from 'evalkit';
import type { ChatAdapter, EmbeddingAdapter } from 'evalkit';

// Replace with your real adapters
const mockEmbedAdapter: EmbeddingAdapter = {
  async embed(texts) {
    return texts.map(() => Array.from({ length: 3 }, () => Math.random()));
  },
};

const mockJudge: ChatAdapter = {
  async complete() {
    return {
      content: JSON.stringify({
        reasoning:
          'The answer correctly states the key facts from the context and does not hallucinate additional claims.',
        score: 4,
      }),
    };
  },
};

// Simulate RAG pipeline output
const ragResults = [
  {
    id: 'rag-factual-1',
    input: 'What are the side effects of ibuprofen?',
    output:
      'Common side effects of ibuprofen include stomach pain, nausea, and dizziness. Serious side effects may include gastrointestinal bleeding and kidney problems.',
    expected:
      'Side effects include stomach upset, nausea, dizziness. Serious: GI bleeding, kidney issues.',
    metadata: {
      retrievedDocs: 3,
      topChunkScore: 0.92,
    },
  },
  {
    id: 'rag-factual-2',
    input: 'How does photosynthesis work?',
    output:
      'Photosynthesis converts sunlight into chemical energy. Plants absorb CO2 and water, using chlorophyll to produce glucose and oxygen.',
    expected:
      'Plants use sunlight, CO2, and water to produce glucose and oxygen via chlorophyll.',
    metadata: {
      retrievedDocs: 5,
      topChunkScore: 0.88,
    },
  },
];

const suite = defineSuite({
  name: 'rag-pipeline-factual-accuracy',
  cases: ragResults,
  scorers: [
    composite({
      scorers: [
        semanticSimilarity({ embed: mockEmbedAdapter, threshold: 0.75 }),
        llmJudge({
          model: mockJudge,
          rubric:
            'The answer is factually accurate based on the expected reference. It does not hallucinate facts not present in the reference. It covers the key points.',
          threshold: 0.6,
        }),
      ],
      weights: [0.3, 0.7], // Judge matters more for factual accuracy
    }),
  ],
});

const report = await suite.run();
consoleReporter({ verbose: true })(report);
```

- [ ] **Step 8: Create .github/workflows/ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
```

- [ ] **Step 9: Create CHANGELOG.md**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-25

### Added
- Core type model: `TestCase`, `Scorer`, `ScoreResult`, `Report`.
- Four scorers: `exactMatch`, `semanticSimilarity`, `llmJudge`, `composite`.
- Bounded-concurrency runner with per-scorer error isolation.
- `consoleReporter` and `jsonReporter`.
- Typed error hierarchy: `ConfigError`, `AdapterError`, `JudgeParseError`, `ScorerError`.
- Provider-agnostic adapter interfaces: `ChatAdapter`, `EmbeddingAdapter`.
- Example adapters for OpenAI and Anthropic.
- Five runnable examples including RAG pipeline evaluation.
- CI pipeline: lint (biome) + typecheck (tsc) + test (vitest).
- Dual ESM/CJS build via tsup.
```

- [ ] **Step 10: Create README.md**

Write the full README following the spec's README Structure (§10 of the design doc). This is long — include:

1. One-line description + CI badge
2. The 60-second "why"
3. Install + hello-world
4. Four scorers with examples
5. Real-world RAG use case
6. "How LLM-as-judge works (and where it fails)" section
7. Provider adapters
8. Design decisions
9. Roadmap
10. License

The README content is too large to inline here. Write it following the design spec sections 1-10. Use the examples from the `examples/` directory. The "How LLM-as-judge works" section should cover: position bias, verbosity bias, self-preference bias, and the mitigations (forced reasoning, temperature 0, structured output, self-consistency).

- [ ] **Step 11: Run full CI locally**

```bash
pnpm ci
```

Expected: lint, typecheck, and all tests pass.

- [ ] **Step 12: Build the package**

```bash
pnpm build
```

Expected: `dist/` directory with `index.js`, `index.cjs`, `index.d.ts`.

- [ ] **Step 13: Commit**

```bash
git add examples/ .github/ CHANGELOG.md README.md
git commit -m "docs: add examples, CI pipeline, README, and CHANGELOG

Five runnable examples including RAG pipeline factual accuracy eval.
OpenAI and Anthropic adapter examples. GitHub Actions CI for Node
18/20/22. README with scorer docs, LLM-judge bias section, and
design decisions."
```

- [ ] **Step 14: Tag v0.1.0**

```bash
git tag v0.1.0
```

---

### Task 11: Final Integration Test + Polish

**Files:**
- Modify: All files as needed for lint/typecheck fixes
- Run: Full test suite, build, verify

**Interfaces:**
- Consumes: All exports from `src/index.ts`
- Produces: Clean, buildable, fully tested package

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass across all test files.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected: Clean build in `dist/`.

- [ ] **Step 5: Verify package exports**

```bash
node -e "const pkg = require('./dist/index.cjs'); console.log(Object.keys(pkg))"
```

Expected: Lists all public exports: `defineSuite`, `exactMatch`, `semanticSimilarity`, `llmJudge`, `composite`, `consoleReporter`, `jsonReporter`, `EvalError`, `ConfigError`, `AdapterError`, `JudgeParseError`, `ScorerError`.

- [ ] **Step 6: Generate API docs**

```bash
pnpm docs
```

Expected: `docs/api/` directory with Typedoc output.

- [ ] **Step 7: Fix any issues found, commit**

If any fixes were needed:

```bash
git add -A
git commit -m "fix: resolve lint/typecheck issues from integration pass"
```

- [ ] **Step 8: Push to GitHub**

```bash
git push -u origin main --tags
```
