// Public API — exports added as modules are implemented.

export { AdapterError, ConfigError, EvalError, JudgeParseError, ScorerError } from "./errors.js";
export { consoleReporter } from "./reporters/console.js";
export { jsonReporter } from "./reporters/json.js";
export { composite } from "./scorers/composite.js";
export { exactMatch } from "./scorers/exact-match.js";
export { llmJudge } from "./scorers/llm-judge.js";
export { semanticSimilarity } from "./scorers/semantic-similarity.js";
export type { Suite } from "./suite.js";
export { defineSuite } from "./suite.js";
export type {
  CaseReport,
  ChatAdapter,
  EmbeddingAdapter,
  ProgressEvent,
  Report,
  Reporter,
  ReportSummary,
  ScoreResult,
  Scorer,
  SuiteConfig,
  TestCase,
} from "./types.js";
