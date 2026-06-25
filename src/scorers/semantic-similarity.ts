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
