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
