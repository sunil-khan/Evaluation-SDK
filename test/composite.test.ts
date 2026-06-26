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
