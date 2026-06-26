/**
 * Real-world use case: Evaluating a RAG pipeline for factual accuracy.
 *
 * This example shows how to evaluate whether a RAG system:
 * 1. Retrieved relevant context (semantic similarity)
 * 2. Generated a factually accurate answer (LLM judge)
 *
 * Uses composite scorer to combine both signals with appropriate weights.
 */
import { composite, consoleReporter, defineSuite, llmJudge, semanticSimilarity } from 'evalkit';
import type { ChatAdapter, EmbeddingAdapter } from 'evalkit';

// Replace with your real adapters
const mockEmbedAdapter: EmbeddingAdapter = {
  async embed(texts) {
    return texts.map(() => Array.from({ length: 3 }, () => Math.random()));
  },
};

const mockJudge: ChatAdapter = {
  async complete() {
    return {
      content: JSON.stringify({
        reasoning:
          'The answer correctly states the key facts from the context and does not hallucinate additional claims.',
        score: 4,
      }),
    };
  },
};

// Simulate RAG pipeline output
const ragResults = [
  {
    id: 'rag-factual-1',
    input: 'What are the side effects of ibuprofen?',
    output:
      'Common side effects of ibuprofen include stomach pain, nausea, and dizziness. Serious side effects may include gastrointestinal bleeding and kidney problems.',
    expected:
      'Side effects include stomach upset, nausea, dizziness. Serious: GI bleeding, kidney issues.',
    metadata: {
      retrievedDocs: 3,
      topChunkScore: 0.92,
    },
  },
  {
    id: 'rag-factual-2',
    input: 'How does photosynthesis work?',
    output:
      'Photosynthesis converts sunlight into chemical energy. Plants absorb CO2 and water, using chlorophyll to produce glucose and oxygen.',
    expected:
      'Plants use sunlight, CO2, and water to produce glucose and oxygen via chlorophyll.',
    metadata: {
      retrievedDocs: 5,
      topChunkScore: 0.88,
    },
  },
];

const suite = defineSuite({
  name: 'rag-pipeline-factual-accuracy',
  cases: ragResults,
  scorers: [
    composite({
      scorers: [
        semanticSimilarity({ embed: mockEmbedAdapter, threshold: 0.75 }),
        llmJudge({
          model: mockJudge,
          rubric:
            'The answer is factually accurate based on the expected reference. It does not hallucinate facts not present in the reference. It covers the key points.',
          threshold: 0.6,
        }),
      ],
      weights: [0.3, 0.7], // Judge matters more for factual accuracy
    }),
  ],
});

const report = await suite.run();
consoleReporter({ verbose: true })(report);
