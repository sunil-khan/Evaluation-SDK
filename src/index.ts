// Public API — exports added as modules are implemented.
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

export { EvalError, ConfigError, AdapterError, JudgeParseError, ScorerError } from './errors.js';
export { exactMatch } from './scorers/exact-match.js';
export { semanticSimilarity } from './scorers/semantic-similarity.js';
export { defineSuite } from './suite.js';
export { consoleReporter } from './reporters/console.js';
export { jsonReporter } from './reporters/json.js';
