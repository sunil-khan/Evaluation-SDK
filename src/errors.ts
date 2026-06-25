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
