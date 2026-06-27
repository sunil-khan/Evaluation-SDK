# evalkit

A small, opinionated, well-typed TypeScript library for evaluating LLM outputs.

[![CI](https://github.com/sunil-khan/Evaluation-SDK/actions/workflows/ci.yml/badge.svg)](https://github.com/sunil-khan/Evaluation-SDK/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/evalkit.svg)](https://npmjs.com/package/evalkit)
[![API Docs](https://img.shields.io/badge/docs-typedoc-blue)](https://sunil-khan.github.io/Evaluation-SDK/)

---

## Why evalkit?

Shipping an LLM feature without evaluation is guessing. Most evaluation tooling is either too heavy (full platforms requiring sign-ups and dashboards) or too thin (a single `if output === expected` check that misses the point).

evalkit sits in the middle: **four composable scorers** covering the full evaluation spectrum — deterministic exact match, embedding-based semantic similarity, LLM-as-judge for subjective quality, and composite weighted scoring — packaged as a zero-dependency-at-runtime TypeScript library you drop into any project.

Key principles:

- **Provider-agnostic.** You inject the model adapters. No API keys in the library, no vendor lock-in.
- **Errors are returned, not thrown.** A flaky judge call doesn't crash your entire evaluation run. Per-scorer errors are captured and surfaced in the report.
- **Normalized scores everywhere.** Every scorer outputs `0..1 + passed`, so heterogeneous scorers (boolean exact-match, continuous similarity, judge scale 1–5) compose cleanly.
- **Transparency by design.** LLM-as-judge exposes the full prompt it sent, the raw response, and the judge's reasoning — no hidden magic.

---

## Install

```bash
npm install evalkit
# or
pnpm add evalkit
```

Requires Node 18+. Core logic is runtime-agnostic (works in Bun, Deno, Edge runtimes).

---

## Hello world

```ts
import { defineSuite, llmJudge, consoleReporter } from 'evalkit';
import { createOpenAIChatAdapter } from './openai-adapter';
import OpenAI from 'openai';

const openaiAdapter = createOpenAIChatAdapter(new OpenAI());

const suite = defineSuite({
  name: 'support-bot-tone',
  cases: [
    {
      id: 'refund-1',
      input: 'I want a refund now!!!',
      output: await myBot('I want a refund now!!!'),
      expected: 'Empathetic, offers concrete next step, no false promises.',
    },
  ],
  scorers: [
    llmJudge({
      model: openaiAdapter,
      rubric: 'Response is empathetic, gives a concrete next step, and makes no commitment it cannot keep.',
    }),
  ],
});

const report = await suite.run();
consoleReporter()(report);
```

---

## The four scorers

### `exactMatch` — deterministic baseline

```ts
import { exactMatch } from 'evalkit';

exactMatch(options?: {
  normalize?: boolean;       // trim + collapse whitespace + lowercase (default: true)
  ignorePunctuation?: boolean;
})
```

Compares `output` against `expected` string. Score is `1` (match) or `0` (no match). The `reason` field reports the first point of divergence on mismatch so you can see exactly what went wrong.

Use this as the first scorer in any suite — it's your "is the plumbing correct" sanity check.

```ts
const suite = defineSuite({
  name: 'exact-match-demo',
  cases: [
    { id: 'greeting', input: 'Say hello', output: 'Hello, World!', expected: 'Hello, World!' },
    { id: 'math', input: 'What is 2+2?', output: 'The answer is 4', expected: 'the answer is 4' },
  ],
  scorers: [exactMatch()],
});
```

See [examples/01-exact-match.ts](./examples/01-exact-match.ts) for the full runnable version.

---

### `semanticSimilarity` — embedding-based

```ts
import { semanticSimilarity } from 'evalkit';

semanticSimilarity(options: {
  embed: EmbeddingAdapter;   // inject your embedding provider
  threshold?: number;        // cosine similarity pass threshold (default: 0.8)
})
```

Embeds both `output` and `expected` in a single batch call and returns the cosine similarity as the score. `passed = similarity >= threshold`.

The adapter interface is minimal by design:

```ts
interface EmbeddingAdapter {
  embed(texts: string[]): Promise<number[][]>;  // batch in, vectors out
}
```

```ts
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
  scorers: [semanticSimilarity({ embed: myEmbedAdapter, threshold: 0.7 })],
});
```

See [examples/02-semantic.ts](./examples/02-semantic.ts) and [examples/openai-adapter.ts](./examples/openai-adapter.ts) for a complete adapter.

---

### `llmJudge` — LLM-as-judge

```ts
import { llmJudge } from 'evalkit';

llmJudge(options: {
  model: ChatAdapter;          // inject your chat model
  rubric: string;              // what "good" means, in plain language
  scale?: { min: number; max: number };   // default: { min: 1, max: 5 }
  threshold?: number;          // normalized pass threshold (default: 0.6)
  references?: ('expected' | 'input')[];  // what context the judge sees
  retries?: number;            // retries for malformed judge output (default: 2)
})
```

The most expressive scorer — and the most dangerous if used naively. See the [How LLM-as-judge works](#how-llm-as-judge-works-and-where-it-fails) section below.

The adapter interface:

```ts
interface ChatAdapter {
  complete(params: {
    system?: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    temperature?: number;
  }): Promise<{ content: string }>;
}
```

```ts
const suite = defineSuite({
  name: 'support-bot-tone',
  cases: [
    {
      id: 'refund-1',
      input: 'I want a refund now!!!',
      output: "I understand your frustration. Let me look into your order right away — can you share your order number?",
      expected: 'Empathetic, offers concrete next step, no false promises.',
    },
  ],
  scorers: [
    llmJudge({
      model: myChatAdapter,
      rubric: 'Response is empathetic, gives a concrete next step, and makes no commitment it cannot keep.',
    }),
  ],
});
```

The judge prompt enforces:
1. **Structured JSON output** — parsed with zod, retried with corrective message on failure
2. **Reasoning before score** — the judge must explain itself before committing to a number
3. **Temperature 0** — determinism on the judge call by default
4. **Full transparency** — the built prompt, raw response, and reasoning are all available in `ScoreResult.raw`

See [examples/03-llm-judge.ts](./examples/03-llm-judge.ts).

---

### `composite` — weighted multi-scorer

```ts
import { composite } from 'evalkit';

composite(options: {
  scorers: Scorer[];
  weights: number[];    // must sum to 1.0; validated at construction
  threshold?: number;   // default: 0.6
})
```

Combines multiple scorers via weighted average of their normalized scores.

```ts
composite({
  scorers: [
    exactMatch(),
    llmJudge({ model: myChatAdapter, rubric: 'Is the answer factually correct?' }),
  ],
  weights: [0.3, 0.7],
})
```

If any inner scorer errors, its weight is redistributed proportionally among the successful scorers. If all inner scorers fail, the composite returns `score: 0, passed: false` with a combined error. The `reason` field includes the per-scorer breakdown.

See [examples/04-composite.ts](./examples/04-composite.ts).

---

## Real-world use case: evaluating a RAG pipeline

Retrieval-Augmented Generation (RAG) pipelines have two failure modes: retrieval failures (wrong or low-relevance documents) and generation failures (hallucinated or unfaithful answers). Composite scoring handles both in one pass.

```ts
import { composite, defineSuite, llmJudge, semanticSimilarity, consoleReporter } from 'evalkit';

const suite = defineSuite({
  name: 'rag-pipeline-factual-accuracy',
  cases: ragTestCases,  // { id, input, output, expected, metadata }
  scorers: [
    composite({
      scorers: [
        // Retrieval quality proxy: does the output semantically match the reference?
        semanticSimilarity({ embed: myEmbedAdapter, threshold: 0.75 }),
        // Factual accuracy: did the model stay grounded in the retrieved context?
        llmJudge({
          model: myChatAdapter,
          rubric: 'The answer is factually accurate based on the expected reference. It does not hallucinate facts not present in the reference. It covers the key points.',
          threshold: 0.6,
        }),
      ],
      weights: [0.3, 0.7],  // judge carries more weight for factual accuracy
    }),
  ],
});

const report = await suite.run();
consoleReporter({ verbose: true })(report);
```

See [examples/05-evaluating-rag-pipeline.ts](./examples/05-evaluating-rag-pipeline.ts) for the full example.

---

## How LLM-as-judge works (and where it fails)

LLM-as-judge is the most powerful evaluation technique in this library — and the most misunderstood. Before deploying it on critical evaluations, you should understand these known failure modes and how evalkit mitigates them.

### What it does

The judge is a separate LLM call that reads your system output and a rubric, then scores the output on a scale. The key insight is that frontier models are better than humans at consistent rubric application once they have clear criteria — but they're also subject to specific biases that can systematically distort scores.

### Known biases

**Position bias**

When comparing two outputs side-by-side, LLM judges tend to prefer whichever response appears first (or sometimes last) in the prompt — regardless of quality. In pairwise evaluation settings, this can produce 60–70% preference for the first option on coin-flip quality pairs.

*Mitigation in evalkit:* evalkit uses single-output scoring against a rubric rather than pairwise comparison. Rubric-based scoring is less susceptible to position effects because there is no A/B comparison being made — the judge is anchored to criteria, not relative ordering.

**Verbosity bias**

LLM judges consistently rate longer responses higher, even when the additional length adds no substantive information. A concise correct answer often scores lower than a verbose answer that says the same thing with more words. This is one of the most well-documented and persistent biases in judge models.

*Mitigation in evalkit:* Write rubrics that explicitly penalize unnecessary length when conciseness matters. Example: *"The response should be direct and answer the question without unnecessary preamble. Verbosity without added value should lower the score."* The judge respects explicit rubric criteria better than implicit quality judgments.

**Self-preference bias (self-serving bias)**

When using the same model family as both the system under test and the judge, the judge tends to prefer outputs from its own family — and specifically its own style. An OpenAI model judging an OpenAI model's output will systematically score it higher than it would score an equivalent output from a different family, and vice versa.

*Mitigation in evalkit:* Use a different model family for the judge than the model being evaluated. If your system uses GPT-4o, consider a judge from a different provider. evalkit's provider-agnostic adapter design makes this straightforward — just inject a different adapter.

**Anchoring and snap-judgement**

Without explicit prompting, judges tend to anchor on an initial impression and then rationalize a score, rather than reasoning through the rubric systematically. This produces inconsistent scores for edge cases and reduces sensitivity to subtle quality differences.

*Mitigation in evalkit:* The judge system prompt enforces that reasoning must appear **before** the score field in the JSON response. The instruction `"Think through your reasoning FIRST, then decide on the score"` causes the model to commit its reasoning in the output before the score token — it cannot retroactively change the reasoning to match a score it has already produced. This is a meaningful structural mitigation, not just cosmetic.

**Format non-compliance and parse errors**

Under real traffic, judge models occasionally return malformed responses — partial JSON, JSON wrapped in markdown, prose instead of structured output. Without handling, this silently produces wrong scores or crashes the evaluation.

*Mitigation in evalkit:* evalkit uses zod to validate judge output against a strict schema. On parse failure, it sends a corrective follow-up message in the same conversation and retries (up to `retries` times, default 2). If retries are exhausted, the result is recorded as an error with `score: 0, passed: false` — visible in the report, never silently dropped.

### What cannot be fully mitigated

Temperature 0 reduces — but does not eliminate — judge variance. On genuinely ambiguous rubrics or borderline outputs, the same prompt can produce different scores across runs due to floating-point non-determinism in inference. For high-stakes evaluations, run the judge multiple times and check consistency before trusting a single run's results.

Rubric quality is the largest single factor in judge reliability. A vague rubric ("is this a good response?") produces noisy scores. A rubric with concrete, measurable criteria ("does the response include a specific next step, not a generic platitude?") produces significantly more reliable scores. Time spent writing good rubrics is higher-leverage than any technical mitigation.

### Summary of evalkit's mitigations

| Bias | Mitigation | Limitation |
|---|---|---|
| Position bias | Single-output rubric scoring (no pairwise) | Cannot eliminate for relative comparisons |
| Verbosity bias | Rubric supports explicit length criteria | Requires intentional rubric design |
| Self-preference | Provider-agnostic adapters — easy to use cross-vendor judge | User must choose different provider |
| Anchoring | Forced reasoning-before-score in structured prompt | Does not prevent all anchoring effects |
| Parse errors | Zod validation + retry with corrective message | Retries add latency; exhausted retries score 0 |
| Variance | Temperature 0 default | Does not fully eliminate variance |

---

## Provider adapters

evalkit never imports OpenAI, Anthropic, or any other provider SDK. You implement a small adapter and inject it. This keeps the library dependency-free at runtime and lets you swap providers without changing your evaluation code.

### OpenAI adapter

See [examples/openai-adapter.ts](./examples/openai-adapter.ts) for a complete implementation. The key functions:

```ts
import OpenAI from 'openai';
import { createOpenAIChatAdapter, createOpenAIEmbeddingAdapter } from './openai-adapter';

const client = new OpenAI();
const chatAdapter = createOpenAIChatAdapter(client, 'gpt-4o');
const embedAdapter = createOpenAIEmbeddingAdapter(client, 'text-embedding-3-small');
```

### Anthropic adapter

See [examples/anthropic-adapter.ts](./examples/anthropic-adapter.ts) for a complete implementation:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicChatAdapter } from './anthropic-adapter';

const client = new Anthropic();
const chatAdapter = createAnthropicChatAdapter(client, 'claude-3-5-sonnet-20241022');
```

Both adapters are ~40 lines of straightforward glue code. For other providers (Cohere, Mistral, local models via Ollama), implement the same two interfaces and the rest of the library works without modification.

### Running examples locally

Examples import from `'evalkit'` (the published package name). To run them during development with path mapping:

1. Create a `tsconfig.examples.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "paths": {
      "evalkit": ["./src/index.ts"]
    }
  },
  "include": ["examples/**/*.ts"]
}
```

2. Run an example with tsx or ts-node with the path option:

```bash
npx tsx --tsconfig tsconfig.examples.json examples/01-exact-match.ts
```

---

## Reporters

### `consoleReporter`

```ts
consoleReporter(options?: { verbose?: boolean })(report)
```

Prints a summary table to stdout with pass rates and average scores per scorer. With `verbose: true`, includes failing case details and judge reasoning.

### `jsonReporter`

```ts
jsonReporter(filePath: string)(report)
```

Writes the full `Report` object as formatted JSON to the specified file path. Auto-creates parent directories if they don't exist.

### Custom reporters

The reporter interface is a function that receives a `Report`:

```ts
type Reporter = (report: Report) => void;
```

Implement your own to push results to Datadog, Slack, a database, or any downstream system.

---

## Suite configuration

```ts
defineSuite({
  name: string;
  cases: TestCase[];
  scorers: Scorer[];
  concurrency?: number;      // max parallel case evaluations (default: 4)
  passPolicy?: 'all' | 'any'; // how a case "passes" with multiple scorers (default: 'all')
  onProgress?: (event: ProgressEvent) => void;
})
```

**`passPolicy`**: The default `'all'` means a case only passes if every scorer passes. This is intentional — a case that passes semantic similarity but fails exact match still has a problem. Use `'any'` only when you want to know if at least one signal succeeded.

**`concurrency`**: The runner uses bounded concurrency (a hand-rolled promise pool) rather than `Promise.all`. This respects provider rate limits and keeps memory bounded for large test suites.

**`onProgress`**: Called after each case completes with `{ completed, total, latestCaseId, elapsedMs }`. Useful for progress bars in long-running evaluation runs.

---

## Design decisions

**Why `score()` returns errors instead of throwing them**

A network timeout in a judge call shouldn't abort a 500-case evaluation suite. Errors returned in `ScoreResult.error` are visible in the report, countable in `summary.errored`, and don't affect other cases. Throwing is reserved for programmer errors caught at construction time (bad scorer config, weights that don't sum to 1.0).

**Why all scores normalize to `0..1`**

Boolean exact-match returns `0` or `1`. Cosine similarity is naturally `0..1`. LLM judge scores on a 1–5 scale normalize to `0..1` via `(score - min) / (max - min)`. This normalization is what makes `composite` work — without it, you can't combine a boolean and a 1–5 scale in a weighted average. The normalized score is always in `ScoreResult.score`; the original scale value (if applicable) is in `ScoreResult.raw`.

**Why `reason` is first-class**

For LLM-as-judge, the judge's reasoning is often more valuable than the score. A score of 3/5 tells you something failed; the reasoning tells you what. evalkit surfaces this in `ScoreResult.reason` on every scorer — exactMatch reports the first differing characters, semanticSimilarity reports the cosine distance, llmJudge surfaces the judge's step-by-step reasoning. Reports are meant to be read, not just tabulated.

**Why the library ships no built-in adapters**

Bundling provider SDKs would force version dependencies on users who don't need them. If you use OpenAI, you shouldn't pay the bundle cost of the Anthropic SDK. The adapter pattern keeps the core zero-dependency-at-runtime while making provider integration trivially easy via the example adapters.

**Why `composite` redistributes weight on scorer error**

Silently assigning `0` to a failed scorer's weight would cause the composite to undercount the weighted average — a scorer erroring would look the same as a scorer scoring zero. Redistribution preserves the score's meaning: it still represents "the weighted quality across the scorers that successfully ran."

---

## Roadmap

**v0.2.0**
- `selfConsistency` option on `llmJudge` — run the judge N times and average scores, reporting variance (calibrated uncertainty)
- `jsonReporter` with structured diffing for regression detection across runs
- Structured output mode for providers that support function calling / response schemas natively

**v0.3.0**
- CLI: `evalkit run <suite-file>` for running suites without writing a script
- Dataset loading from JSONL/CSV for large offline evaluations
- Trace-level evaluation (multi-turn conversations, tool-use chains)

**Not planned for v1**
- Web UI / dashboard — this is a library, not a platform
- Cloud sync or telemetry
- Fine-tuning or prompt optimization

---

## License

MIT — see [LICENSE](./LICENSE).

---

*evalkit — evaluation that ships with the feature, not after it.*
