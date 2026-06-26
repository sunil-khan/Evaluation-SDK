# evalkit — Design Specification

**Date:** 2026-06-25
**Status:** Approved
**Repository:** github.com/sunil-khan/Evaluation-SDK
**npm package:** evalkit

---

## Overview

A small, opinionated, well-typed TypeScript library for evaluating LLM outputs. Provider-agnostic, production-grade, built as a public portfolio piece.

Four scorers covering the evaluation spectrum: deterministic (exact match), embedding-based (semantic similarity), LLM-as-judge (rubric grading), and composite (weighted combination). Clean public API, honest error handling, documented failure modes.

---

## Architecture: Approach B — Separated Runner

Suite and runner are separate modules with distinct responsibilities.

```
User
  │
  ▼
defineSuite(config)          ← validates config with zod, returns Suite
  │
  ▼
suite.run()                  ← delegates to runner
  │
  ▼
Runner                       ← bounded concurrency, error isolation, ordering
  │
  ├── Case 1 → [Scorer A, Scorer B, Scorer C] → CaseReport
  ├── Case 2 → [Scorer A, Scorer B, Scorer C] → CaseReport
  └── Case N → [Scorer A, Scorer B, Scorer C] → CaseReport
  │
  ▼
Suite                        ← assembles Report from CaseReports
  │
  ▼
Reporter                     ← presents Report (console table, JSON file, custom)
```

**Why separated:**
- `suite.ts` — config validation, report assembly. Knows WHAT to run.
- `runner.ts` — concurrency pool, error boundaries, deterministic ordering. Knows HOW to run.
- Runner testable independently with mock scorers. No suite config noise.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict mode, all flags) |
| Module format | ESM-first, dual CJS+ESM via `tsup` |
| Runtime target | Node 18+ (core is runtime-agnostic) |
| Build | `tsup` |
| Test | `vitest` |
| Lint/format | `biome` |
| Validation | `zod` |
| Package manager | `pnpm` |
| CI | GitHub Actions |
| Docs | Typedoc (API) + handwritten README |

**Core dependency: `zod` only.** Adapters injected by users — no provider SDK lock-in.

---

## Type Model

All interfaces in `src/types.ts`. Foundation of everything.

### TestCase

```ts
interface TestCase<TInput = unknown, TExpected = unknown> {
  id: string;
  input: TInput;
  output: string;
  expected?: TExpected;
  metadata?: Record<string, unknown>;
}
```

- Generic `TInput` and `TExpected` flow through to scorers — type mismatches caught at compile time.
- `output` is pre-resolved. SDK evaluates outputs, doesn't generate them.

### Scorer

```ts
interface Scorer<TInput = unknown, TExpected = unknown> {
  readonly name: string;
  score(testCase: TestCase<TInput, TExpected>): Promise<ScoreResult>;
}
```

### ScoreResult

```ts
interface ScoreResult {
  scorer: string;
  score: number;          // normalized 0..1 — ALL scorers use this range
  passed: boolean;        // score >= threshold
  reason?: string;        // human-readable explanation (every scorer fills this)
  raw?: unknown;          // scorer-specific detail (e.g. judge's full prompt)
  error?: EvalError;      // present if scorer failed — error-as-value, not thrown
  latencyMs: number;
}
```

### Adapter Interfaces

```ts
interface ChatAdapter {
  complete(params: {
    system?: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    temperature?: number;
  }): Promise<{ content: string }>;
}

interface EmbeddingAdapter {
  embed(texts: string[]): Promise<number[][]>;
}
```

Provider-agnostic. User implements once for their provider. Example adapters for OpenAI and Anthropic in `examples/`.

### Key Type Decisions

1. **0..1 normalization** — exact match gives 0/1, similarity gives 0.0-1.0, judge gives 1-5 mapped to 0..1. Heterogeneous scorers become composable and aggregatable.
2. **Error-as-value** — `ScoreResult.error` returned, not thrown. Flaky judge doesn't crash suite. Runner decides policy.
3. **`reason` first-class** — every scorer explains WHY. Exact match: "strings differ at index 14". Judge: full reasoning. Debug time drops.
4. **Generics flow through** — `defineSuite<TInput, TExpected>` enforces type alignment between cases and scorers at compile time.

---

## Scorers

### exactMatch

```ts
exactMatch(options?: {
  normalize?: boolean;           // trim + collapse whitespace + lowercase (default true)
  ignorePunctuation?: boolean;
}): Scorer
```

- **Requires `expected`** — if `expected` is `undefined`, returns `ScoreResult.error`: "exactMatch requires `expected` to be set on the test case."
- Compares `output` vs `expected` (string). Score: `1` or `0`.
- `reason` reports first point of divergence on mismatch.
- Pure, sync internally, no network calls. Sanity-check scorer.

### semanticSimilarity

```ts
semanticSimilarity(options: {
  embed: EmbeddingAdapter;
  threshold?: number;            // default 0.8 cosine
}): Scorer
```

- **Requires `expected`** — if `expected` is `undefined`, returns `ScoreResult.error`: "semanticSimilarity requires `expected` to be set on the test case."
- Embeds `output` and `expected`, returns cosine similarity as score.
- `passed = similarity >= threshold`.
- Batches both texts in one `embed()` call.
- Guards: validates vector dimensions match, handles zero-vectors.
- Caches identical strings per scorer instance lifetime.

### llmJudge

```ts
llmJudge(options: {
  model: ChatAdapter;
  rubric: string;
  scale?: { min: number; max: number };  // default 1..5
  threshold?: number;                     // normalized pass line, default 0.6
  references?: ('expected' | 'input')[];   // default ['expected', 'input'] — controls what judge sees
  retries?: number;                       // default 2
}): Scorer
```

**Internal flow:**

1. Build prompt: system message with rubric + user message with input/output/expected.
2. Force judge to reason first, then score (reduces anchoring).
3. Judge returns JSON: `{ reasoning: string, score: number }`.
4. Parse with `zod`. On parse failure → retry with corrective message (up to `retries`).
5. Normalize: `(score - min) / (max - min)` → 0..1.
6. All retries fail → `ScoreResult.error`, no crash.
7. Full prompt exposed on `raw` — nothing hidden.

**Bias mitigations:**
- `temperature: 0` default (reduces variance).
- Reasoning-before-score (reduces snap judgment).
- Position/verbosity bias documented in README.

### composite

```ts
composite<TInput = unknown, TExpected = unknown>(options: {
  scorers: Scorer<TInput, TExpected>[];
  weights: number[];          // must sum to 1.0; validated at construction
  threshold?: number;         // normalized pass line, default 0.6
}): Scorer<TInput, TExpected>
```

- Runs all inner scorers, combines via weighted average.
- `passed = weightedAverage >= threshold`.
- `reason` shows per-scorer breakdown: `"exactMatch: 0.0 (w:0.3) | llmJudge: 0.85 (w:0.7)"`.
- Partial error: weight redistributed proportionally among successful scorers.
- All scorers error: `ScoreResult.error` with combined info, `score: 0`, `passed: false`.

---

## Suite & Runner

### Suite (`src/suite.ts`)

```ts
interface SuiteConfig<TInput = unknown, TExpected = unknown> {
  name: string;
  cases: TestCase<TInput, TExpected>[];
  scorers: Scorer<TInput, TExpected>[];
  concurrency?: number;              // default 4
  passPolicy?: 'all' | 'any';       // default 'all'
  onProgress?: (e: ProgressEvent) => void;
}

interface ProgressEvent {
  completed: number;
  total: number;
  latestCaseId: string;
  elapsedMs: number;
}

function defineSuite<TInput, TExpected>(
  config: SuiteConfig<TInput, TExpected>
): Suite;

interface Suite {
  run(): Promise<Report>;
}
```

- Validates config with `zod` at construction — bad config fails fast with friendly `ConfigError`.
- `passPolicy: 'all'` (default): case passes only if every scorer passes. A case that passes semantic but fails exact still has a problem.

### Runner (`src/runner.ts`)

Three responsibilities:

1. **Bounded concurrency** — hand-rolled promise pool, default 4. No `Promise.all` (rate limits). No `p-limit` (zero unnecessary deps).
2. **Error isolation** — each scorer runs in its own try/catch. Scorer throws → `ScoreResult.error`. Other scorers and cases continue. Nothing aborts the suite.
3. **Deterministic ordering** — cases finish in any order (concurrency), report always ordered by original index.

Progress events emitted after each case completes.

---

## Reports

```ts
interface Report {
  suite: string;
  startedAt: string;          // ISO 8601 format (e.g. "2026-06-25T14:30:00.000Z")
  finishedAt: string;         // ISO 8601 format
  cases: CaseReport[];
  summary: {
    total: number;
    passed: number;          // cases where CaseReport.passed === true
    failed: number;          // cases where CaseReport.passed === false (passed + failed = total, always)
    errored: number;         // separate dimension: cases with at least one scorer error (can overlap with failed)
    passRate: number;        // 0..1 (passed / total)
    byScorer: Record<string, { passRate: number; avgScore: number }>;
    avgLatencyMs: number;
  };
}

interface CaseReport {
  case: TestCase;
  results: ScoreResult[];
  passed: boolean;           // determined by passPolicy
}
```

### Reporters

```ts
type Reporter = (report: Report) => void | Promise<void>;
```

**`consoleReporter(options?: { verbose?: boolean })`** — colored table to stdout. Pass/fail with reasons. `verbose: true` shows metadata and raw scorer detail. The README screenshot.

**`jsonReporter(path)`** — full Report JSON to file. For CI diffing and regression tracking. Auto-creates parent directories if they don't exist.

Reporters are Node-specific (ANSI colors, `fs`). Core library stays runtime-agnostic. Reporters are the boundary. Users can write custom reporters via the interface.

---

## Error Hierarchy

```
EvalError (base)
├── ConfigError         → bad config at setup time (THROWN — programmer mistake)
├── AdapterError        → embedding/chat provider call failed (RETURNED in ScoreResult)
├── JudgeParseError     → LLM judge returned unparseable response (RETURNED in ScoreResult)
└── ScorerError         → scorer-level failure wrapper (RETURNED in ScoreResult)
```

**Rule:** Config errors throw (fail fast). Runtime errors return (suite keeps running).

Each error type includes:
- Actionable message (what went wrong + what to do)
- Context (which scorer, which case ID)
- Raw data where applicable (e.g. judge's unparseable response)

---

## Repository Structure

```
evalkit/
├── src/
│   ├── index.ts                    # public exports only
│   ├── types.ts                    # all interfaces: TestCase, Scorer, ScoreResult, Report, ChatAdapter, EmbeddingAdapter
│   ├── suite.ts                    # defineSuite + Suite (config validation, report assembly)
│   ├── runner.ts                   # bounded-concurrency execution engine
│   ├── errors.ts                   # EvalError hierarchy
│   ├── scorers/
│   │   ├── exact-match.ts
│   │   ├── semantic-similarity.ts
│   │   ├── llm-judge.ts
│   │   └── composite.ts
│   └── reporters/
│       ├── console.ts
│       └── json.ts
├── examples/
│   ├── openai-adapter.ts
│   ├── anthropic-adapter.ts
│   ├── 01-exact-match.ts
│   ├── 02-semantic.ts
│   ├── 03-llm-judge.ts
│   ├── 04-composite.ts
│   └── 05-evaluating-rag-pipeline.ts
├── test/
│   ├── exact-match.test.ts
│   ├── semantic-similarity.test.ts
│   ├── llm-judge.test.ts
│   ├── composite.test.ts
│   ├── suite.test.ts               # config validation, report assembly, passPolicy
│   ├── runner.test.ts               # concurrency, error isolation, ordering
│   ├── errors.test.ts               # error hierarchy, messages, context
│   ├── reporters/
│   │   ├── console.test.ts          # table formatting, colors, verbose mode
│   │   └── json.test.ts             # file writing, directory creation
│   └── types.test.ts                # zod schema validation for all types
├── .github/workflows/ci.yml
├── .gitignore                      # node_modules, dist, coverage, .env, *.tgz
├── biome.json
├── README.md
├── CHANGELOG.md
├── LICENSE
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## Public API Surface

```ts
import {
  defineSuite,
  exactMatch,
  semanticSimilarity,
  llmJudge,
  composite,
  consoleReporter,
  jsonReporter,
  type Scorer,
  type TestCase,
  type ScoreResult,
  type Report,
  type ChatAdapter,
  type EmbeddingAdapter,
} from 'evalkit';
```

Small, memorable, one import path.

---

## Engineering Hygiene

- **`strict: true`** + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No `any` in public API.
- **Typed error hierarchy** with actionable messages.
- **TSDoc on every public symbol** — drives Typedoc + editor hovers.
- **Zero `console.log` in core** — only reporters write output.
- **CI pipeline** — biome lint + tsc typecheck + vitest test on every PR. Green badge in README.
- **Semantic versioning** + CHANGELOG. Tag `v0.1.0`.
- **Conventional commits** — process discipline.
- **Zod-validated configs** — friendly error messages for misconfiguration.

---

## README Structure

1. One-line description + CI badge + npm badge.
2. The 60-second "why" — evals matter; this is a clean, typed take.
3. Install + one-screen hello-world (must actually run).
4. Four scorers, each with a tiny example.
5. **Real-world use case:** Evaluating a RAG pipeline for factual accuracy. Composite scorer with semantic similarity + LLM-judge weighted. Shows understanding of the PROBLEM, not just the API.
6. **"How LLM-as-judge works (and where it fails)"** — judge unreliability, biases (position, verbosity, self-preference), mitigations (forced reasoning, temperature 0). Highest-signal section in the repo.
7. Provider adapters (bring your own; examples linked).
8. Design decisions (normalization opinion, error-as-value, concurrency, composite weight redistribution).
9. Roadmap (microservice layer planned as separate project).
10. License (MIT).

---

## Testing Strategy

Every source file has a corresponding test file. No exceptions.

| Source File | Test File | What's Tested |
|---|---|---|
| `types.ts` | `types.test.ts` | Zod schema validation for all interfaces, generic type constraints |
| `errors.ts` | `errors.test.ts` | Error hierarchy, instanceof checks, actionable messages, context fields |
| `scorers/exact-match.ts` | `exact-match.test.ts` | String comparison, normalization, punctuation, undefined expected handling |
| `scorers/semantic-similarity.ts` | `semantic-similarity.test.ts` | Mock EmbeddingAdapter, cosine math, dimension mismatch, zero-vector, undefined expected, caching |
| `scorers/llm-judge.ts` | `llm-judge.test.ts` | Mock ChatAdapter, happy path, malformed retry, all retries exhausted, normalization math, prompt construction |
| `scorers/composite.ts` | `composite.test.ts` | Weight validation (sum to 1.0), weighted average math, partial error redistribution, all-error edge case |
| `runner.ts` | `runner.test.ts` | Concurrency limits (verify max N running), error isolation, deterministic ordering, progress events |
| `suite.ts` | `suite.test.ts` | Config validation (zod errors), report assembly, passPolicy 'all' vs 'any', empty cases rejection |
| `reporters/console.ts` | `reporters/console.test.ts` | Table formatting, colored output, verbose mode, failing case detail |
| `reporters/json.ts` | `reporters/json.test.ts` | JSON serialization, file writing, parent directory auto-creation |

All tests deterministic and free (no real API calls). Mock adapters return canned responses. Unhappy paths tested for every module.

---

## Definition of Done (v1)

- [ ] Four scorers implemented, typed, documented, tested (incl. unhappy paths).
- [ ] Runner with bounded concurrency + per-scorer error isolation.
- [ ] Console + JSON reporters.
- [ ] OpenAI + Anthropic example adapters.
- [ ] Five runnable examples, including RAG pipeline factual accuracy.
- [ ] CI green (biome lint, tsc typecheck, vitest test) with badge.
- [ ] README with "how judge works and fails" section + real-world RAG use case.
- [ ] Typedoc API reference generated.
- [ ] Dual ESM/CJS build via tsup.
- [ ] No `any` in public API; `strict` on.
- [ ] Conventional commits, CHANGELOG, tagged `v0.1.0`.

---

## Non-Goals (v1)

- No web UI / dashboard.
- No dataset management, cloud sync, telemetry.
- No CLI (stretch goal).
- No agent/trace evaluation (single input/output only).
- No `selfConsistency` averaging (stretch goal).

## Future (separate projects/specs)

- Microservice layer: REST API (`POST /v1/evaluate`), job queue, dashboard.
- CLI: `evalkit run ./suite.ts`.
- Regression mode: diff Report JSON vs baseline.
- Dataset loader: CSV/JSONL to TestCases.
