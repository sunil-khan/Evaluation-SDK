# `evalkit` — TypeScript LLM Evaluation SDK

**v1 Technical Specification**

A small, opinionated, well-typed library for evaluating LLM outputs in TypeScript. Built to be read as a portfolio piece: clean public API, honest handling of the hard parts (LLM-as-judge reliability), and production-grade engineering hygiene.

> **Naming:** `evalkit` is likely taken on npm. Check availability before publishing. Alternatives to check: `evalcraft`, `scorecraft`, `llm-eval`, `judgement`, `@sunilkhan/evalkit` (scoped, guaranteed available). Avoid "the first/only TS eval library" framing — position as *clean, minimal, well-documented*.

---

## 1. Design Goals & Non-Goals

**Goals**
- A typed, ergonomic API for defining test cases and running them through scorers.
- Three scorers that cover the real spectrum: deterministic (exact/structural), embedding-based (semantic), and LLM-as-judge (rubric grading).
- Provider-agnostic: the library never hardcodes OpenAI/Anthropic; the user injects model adapters.
- Deterministic, reproducible runs where possible; explicit about where they aren't (LLM-as-judge).
- Excellent DX: great types, helpful errors, runnable examples, a README that teaches.

**Non-Goals (v1 — keep scope tight)**
- No web UI / dashboard.
- No dataset management, no cloud sync, no telemetry.
- No fine-tuning, no prompt optimization.
- No agent/trace evaluation (single input→output only).
- No CLI in v1 core (optional stretch; see §11).

The discipline of saying no here is part of the signal. A finished, focused library beats a sprawling unfinished one.

---

## 2. Tech Stack & Tooling

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Core competency; the whole point. |
| Module format | ESM-first, dual CJS+ESM output | Modern + compatible. Use `tsup`. |
| Runtime target | Node 18+ (and runtime-agnostic core) | Core logic avoids Node-only APIs so it runs in edge/bun/deno. |
| Build | `tsup` | Zero-config dual output, fast. |
| Test | `vitest` | TS-native, fast, great DX. |
| Lint/format | `biome` | Single tool for lint + format. Modern, fast, zero-config. |
| Validation | `zod` | Runtime validation of configs + structured LLM-judge output parsing. |
| Package manager | `pnpm` | Signals modern tooling. |
| CI | GitHub Actions | Lint + typecheck + test on PR. Shows rigor. |
| Docs | Typedoc (API) + handwritten README | API reference + narrative. |

**Dependencies kept minimal.** Core depends only on `zod`. Embedding/judge scorers depend on whatever adapter the user passes — no SDK lock-in.

---

## 3. Core Concepts & Type Model

The mental model is four nouns: **TestCase**, **Scorer**, **Suite**, **Report**.

```ts
// A single thing to evaluate.
interface TestCase<TInput = unknown, TExpected = unknown> {
  id: string;
  input: TInput;                 // what was/should be sent to the system under test
  output: string;                // the LLM output being judged (resolved before scoring)
  expected?: TExpected;          // optional reference (golden answer, rubric, etc.)
  metadata?: Record<string, unknown>;
}

// A scorer takes a case and returns a normalized result.
interface Scorer<TInput = unknown, TExpected = unknown> {
  readonly name: string;
  score(testCase: TestCase<TInput, TExpected>): Promise<ScoreResult>;
}

// Every scorer returns this shape — normalized 0..1 + pass/fail + explanation.
interface ScoreResult {
  scorer: string;
  score: number;                 // normalized 0..1
  passed: boolean;               // score >= threshold (scorer-defined or overridden)
  reason?: string;               // human-readable explanation (critical for judge)
  raw?: unknown;                 // scorer-specific detail (e.g. judge's full response)
  error?: EvalError;             // present if the scorer failed to produce a score
  latencyMs: number;
}
```

**Design decisions worth defending in an interview:**
- **Every scorer normalizes to `0..1` + `passed`.** This makes heterogeneous scorers (boolean exact-match, continuous similarity, judge) composable and aggregatable. Document this explicitly.
- **`reason` is first-class, not an afterthought.** For LLM-as-judge, the explanation is half the value. Exact-match fills it too ("strings differ at index 14").
- **Errors are returned, not thrown, inside `score()`.** A flaky judge call shouldn't crash the whole suite. The runner decides policy (retry/skip/fail). Throwing is reserved for programmer errors (bad config).
- **Generics flow through** so `expected` can be strongly typed per suite without `any`.

---

## 4. The Scorers (the heart of v1)

### 4.1 `exactMatch` — deterministic baseline
```ts
exactMatch(options?: {
  normalize?: boolean;      // trim + collapse whitespace + lowercase (default true)
  ignorePunctuation?: boolean;
}): Scorer
```
- Compares `output` against `expected` (string). Score is `1` or `0`.
- `reason` reports first divergence on mismatch.
- Pure, sync internally, fast. The "is your plumbing correct" sanity scorer.

### 4.2 `semanticSimilarity` — embedding-based
```ts
semanticSimilarity(options: {
  embed: EmbeddingAdapter;     // injected; library is provider-agnostic
  threshold?: number;          // default 0.8 cosine
}): Scorer
```
- Embeds `output` and `expected`, returns cosine similarity as the score.
- `passed = similarity >= threshold`.
- Adapter interface (user implements once for their provider):
```ts
interface EmbeddingAdapter {
  embed(texts: string[]): Promise<number[][]>; // batch in, vectors out
}
```
- **Engineering notes to implement:** batch both texts in one call; validate vector dimensions match; guard against zero-vectors; cache identical strings per scorer instance lifetime (cleared on GC, no memory leak risk).

### 4.3 `llmJudge` — LLM-as-judge (THE centerpiece)
This is the scorer interviewers probe. Build it to show you understand its failure modes.

```ts
llmJudge(options: {
  model: ChatAdapter;              // injected chat model
  rubric: string;                  // what "good" means, in plain language
  scale?: { min: number; max: number };   // default 1..5
  threshold?: number;              // normalized pass line, default 0.6 (scale normalized internally to 0..1)
  references?: ('expected' | 'input')[];  // what to show the judge
  retries?: number;                // default 2, for malformed judge output
}): Scorer
```

**Required design properties — implement all of these and document why:**

1. **Structured, parseable output.** The judge is prompted to return JSON matching a `zod` schema: `{ score: number, reasoning: string }`. Parse with `zod`; on parse failure, retry with a corrective message, up to `retries`. If still bad → `ScoreResult.error`, not a crash.

2. **Forced reasoning before score.** The prompt requires the judge to reason *first*, then emit the score (reduces anchoring/snap-judgement). Reasoning is surfaced in `reason`.

3. **Normalization.** A 1–5 judge score maps to `0..1` (`(score - min) / (max - min)`), so it composes with the other scorers. `passed = normalized >= threshold`.

4. **Determinism controls.** Default `temperature: 0` for the judge call (document that this reduces—not eliminates—variance). Expose it so users can measure judge stability.

5. **Prompt construction is explicit and inspectable.** Expose the built prompt on `raw` so users (and you, in the README) can see exactly what the judge saw. No hidden magic.

6. **Position/verbosity bias awareness.** Document these known LLM-judge biases in the README and, as a stretch, offer an optional `selfConsistency?: number` that runs the judge N times and averages (shows you know the mitigation).

**Chat adapter interface:**
```ts
interface ChatAdapter {
  complete(params: {
    system?: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    temperature?: number;
  }): Promise<{ content: string }>;
}
```

Provider-agnostic by design: ship example adapters for OpenAI and Anthropic in `examples/`, not in core.

### 4.4 `composite` — weighted multi-scorer composition

```ts
composite(options: {
  scorers: Scorer[];
  weights: number[];          // must sum to 1.0; validated at construction
  threshold?: number;         // normalized pass line, default 0.6
}): Scorer
```

- Runs all inner scorers, combines via weighted average of normalized scores.
- `passed = weightedAverage >= threshold`.
- `reason` includes per-scorer breakdown with individual scores and weights.
- If any inner scorer errors, that weight is redistributed proportionally among successful scorers (documented behavior).
- If ALL inner scorers error → `ScoreResult.error` with combined error info, `score: 0`, `passed: false`.
- Shows compositional thinking — small addition, big architectural signal.

---

## 5. Suites & The Runner

```ts
interface SuiteConfig<TInput = unknown, TExpected = unknown> {
  name: string;
  cases: TestCase<TInput, TExpected>[];
  scorers: Scorer<TInput, TExpected>[];
  concurrency?: number;     // default 4
  passPolicy?: 'all' | 'any';  // default 'all' — how a case "passes" with multiple scorers
  onProgress?: (e: ProgressEvent) => void;
}

interface ProgressEvent {
  completed: number;
  total: number;
  latestCaseId: string;
  elapsedMs: number;
}

function defineSuite<TInput, TExpected>(config: SuiteConfig<TInput, TExpected>): Suite;
interface Suite { run(): Promise<Report>; }
```

**Runner responsibilities (implement carefully — this is where engineering maturity shows):**
- Run cases with **bounded concurrency** (default 4) — a hand-rolled promise pool or `p-limit`. Don't `Promise.all` everything (rate limits, memory).
- Each case runs all scorers; per-scorer errors are captured into that scorer's `ScoreResult.error`, never aborting the suite.
- Collect `latencyMs` per scorer and per case.
- Emit progress events for long runs.
- Fully deterministic ordering in the report regardless of completion order.

---

## 6. Reports

```ts
interface Report {
  suite: string;
  startedAt: string; finishedAt: string;
  cases: CaseReport[];
  summary: {
    total: number;
    passed: number;            // case passes (all scorers passed, or policy-defined)
    failed: number;
    errored: number;           // cases where at least one scorer produced an error
    passRate: number;          // 0..1
    byScorer: Record<string, { passRate: number; avgScore: number }>;
    avgLatencyMs: number;
  };
}
interface CaseReport {
  case: TestCase;
  results: ScoreResult[];
  passed: boolean;             // aggregation policy (default: all scorers passed)
}
```

**Reporters (pluggable):**
- `consoleReporter()` — pretty table to stdout, colored pass/fail, failing-case detail. The thing screenshotted in your README.
- `jsonReporter(path)` — writes the full `Report` JSON (for CI diffing / regression tracking).
- Reporter interface so users can add their own.

Aggregation policy (how a case "passes" when it has multiple scorers) is set via `SuiteConfig.passPolicy`: `'all'` (default) or `'any'`. Default is `'all'` because a case that passes semantic similarity but fails exact match still has a problem. Document this opinion.

---

## 7. Public API Surface (the whole thing)

Keep it tiny and memorable:

```ts
import {
  defineSuite,
  exactMatch,
  semanticSimilarity,
  llmJudge,
  composite,
  consoleReporter,
  jsonReporter,
  type Scorer, type TestCase, type ScoreResult, type Report,
} from 'evalkit';
```

One-screen "hello world" that must work from the README:
```ts
const suite = defineSuite({
  name: 'support-bot-tone',
  cases: [
    { id: 'refund-1', input: 'I want a refund now!!!',
      output: await myBot('I want a refund now!!!'),
      expected: 'Empathetic, offers concrete next step, no false promises.' },
  ],
  scorers: [
    llmJudge({ model: openaiAdapter, rubric: 'Response is empathetic, gives a concrete next step, and makes no commitment it cannot keep.' }),
  ],
});
const report = await suite.run();
consoleReporter()(report);
```

---

## 8. Repository Structure

```
evalkit/
├─ src/
│  ├─ index.ts                 # public exports only
│  ├─ types.ts                 # TestCase, Scorer, ScoreResult, Report
│  ├─ suite.ts                 # defineSuite + Suite
│  ├─ runner.ts                # bounded-concurrency execution
│  ├─ errors.ts                # EvalError hierarchy
│  ├─ scorers/
│  │  ├─ exact-match.ts
│  │  ├─ semantic-similarity.ts
│  │  ├─ llm-judge.ts          # most-commented file; explain the hard parts inline
│  │  └─ composite.ts          # weighted multi-scorer composition
│  └─ reporters/
│     ├─ console.ts
│     └─ json.ts
├─ examples/
│  ├─ openai-adapter.ts
│  ├─ anthropic-adapter.ts
│  ├─ 01-exact-match.ts
│  ├─ 02-semantic.ts
│  ├─ 03-llm-judge.ts
│  ├─ 04-composite.ts
│  └─ 05-evaluating-rag-pipeline.ts # real-world RAG factual accuracy eval (biggest signal)
├─ test/
│  ├─ types.test.ts                 # zod schema validation
│  ├─ errors.test.ts                # error hierarchy, messages
│  ├─ exact-match.test.ts
│  ├─ semantic-similarity.test.ts   # with a mock embedding adapter
│  ├─ llm-judge.test.ts             # with a mock chat adapter (deterministic!)
│  ├─ composite.test.ts             # weight validation, error redistribution
│  ├─ suite.test.ts                 # config validation, report assembly
│  ├─ runner.test.ts                # concurrency, error isolation
│  └─ reporters/
│     ├─ console.test.ts            # table formatting, verbose mode
│     └─ json.test.ts               # file writing, directory creation
├─ .github/workflows/ci.yml
├─ README.md
├─ LICENSE                     # MIT
├─ package.json
├─ tsconfig.json
└─ tsup.config.ts
```

**Testing note that matters:** test the judge scorer with a **mock `ChatAdapter`** returning canned responses, so tests are deterministic and free. Include one test for the malformed-output retry path and one for the error path. This proves you test the unhappy paths — a senior signal.

---

## 9. Engineering Hygiene (what makes it read as senior, not hobby)

- **`strict: true`** tsconfig, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any` in the public API.
- **Errors are a typed hierarchy** (`EvalError` → `AdapterError`, `JudgeParseError`, `ConfigError`), each with actionable messages.
- **Every public symbol has a TSDoc comment** (drives Typedoc + editor hovers).
- **Zero `console.log` in core** — only reporters write output.
- **CI green badge** in the README (lint + typecheck + test).
- **Semantic versioning + a CHANGELOG.** Tag `v0.1.0`.
- **Conventional commits** (shows process discipline).
- **`zod`-validated configs** with friendly messages when a user misconfigures a scorer.
- One **intentional, documented opinion** somewhere (e.g., "all scorers normalize to 0..1 — here's why"), shown in the README. Opinionated > generic.

---

## 10. README Structure (this sells the project to a hiring manager)

1. One-line description + CI badge + npm badge.
2. The 60-second "why" (evals matter; this is a clean, typed take).
3. Install + the one-screen hello-world (must actually run).
4. The four scorers (exact, semantic, judge, composite), each with a tiny example.
5. **Real-world use case: Evaluating a RAG pipeline for factual accuracy.** Not abstract — show the actual problem (retrieved context + LLM answer vs ground truth), use composite scorer with semantic similarity + LLM-judge weighted. This proves you understand the PROBLEM, not just the API.
6. **"How LLM-as-judge works (and where it fails)"** — a short, honest section on judge unreliability, the biases (position, verbosity, self-preference), and how this library mitigates them (forced reasoning, temperature 0, optional self-consistency). *This section is the single highest-signal thing in the repo — it shows you understand evals, not just wired an API.*
7. Provider adapters (bring your own; examples linked).
8. Design decisions (the normalization opinion; error-as-value; concurrency; composite weight redistribution).
9. Roadmap (honest, short — signals product thinking). Note: microservice layer (REST API, job queue, dashboard) planned as separate project.
10. License.

---

## 11. Stretch Goals (only after v1 is finished & polished)

Clearly fenced off so the agent doesn't scope-creep:
- A thin **CLI** (`evalkit run ./suite.ts`) for CI use.
- **Regression mode**: diff today's `Report` JSON vs a baseline, fail CI on regression.
- **`selfConsistency`** averaging for the judge (the bias mitigation mentioned above).
- A **dataset loader** (CSV/JSONL → TestCases).

Do not start these until v1 is shippable. A polished small thing is the goal.

---

## 12. Definition of Done (v1)

- [ ] Four scorers (exact, semantic, judge, composite) implemented, typed, documented, tested (incl. unhappy paths).
- [ ] Runner with bounded concurrency + per-scorer error isolation.
- [ ] Console + JSON reporters.
- [ ] OpenAI + Anthropic example adapters in `examples/`.
- [ ] Five runnable examples, including the RAG pipeline factual accuracy one.
- [ ] CI green (lint, typecheck, test) with badge.
- [ ] README with the "how judge works and fails" section + real-world RAG use case.
- [ ] Typedoc API reference generated.
- [ ] Dual ESM/CJS build, published `v0.1.0` to npm (optional but strong).
- [ ] No `any` in public API; `strict` on.

---

### Instructions for the coding agent
Build **v1 only** (sections 1–10 and 12). Do not implement stretch goals (§11). Prioritize, in order: (1) the type model in `types.ts`, (2) `exactMatch` + runner + console reporter as a working vertical slice, (3) `semanticSimilarity` with a mock adapter test, (4) `llmJudge` with full attention to structured output, retries, normalization, and error-as-value, (5) `composite` scorer with weight validation and error redistribution, (6) examples (including RAG pipeline eval) + README. Keep the public API surface exactly as in §7. Favor clarity and documented intent over cleverness — this code is read by hiring managers.
