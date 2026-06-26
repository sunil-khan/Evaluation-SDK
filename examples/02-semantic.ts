import { consoleReporter, defineSuite, semanticSimilarity } from 'evalkit';
import type { EmbeddingAdapter } from 'evalkit';

// Replace with your real embedding adapter (see openai-adapter.ts)
const mockEmbedAdapter: EmbeddingAdapter = {
  async embed(texts) {
    // In production, this calls your embedding provider
    // This mock returns random vectors for demonstration
    return texts.map(() => Array.from({ length: 3 }, () => Math.random()));
  },
};

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
  scorers: [semanticSimilarity({ embed: mockEmbedAdapter, threshold: 0.7 })],
});

const report = await suite.run();
consoleReporter()(report);
