import { describe, expect, it } from 'vitest';
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
