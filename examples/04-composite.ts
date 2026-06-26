import { composite, consoleReporter, defineSuite, exactMatch, llmJudge } from 'evalkit';
import type { ChatAdapter } from 'evalkit';

const mockJudge: ChatAdapter = {
  async complete() {
    return {
      content: JSON.stringify({
        reasoning: 'Correct and well-structured answer.',
        score: 4,
      }),
    };
  },
};

const suite = defineSuite({
  name: 'composite-demo',
  cases: [
    {
      id: 'qa-1',
      input: 'What is the capital of France?',
      output: 'Paris',
      expected: 'Paris',
    },
  ],
  scorers: [
    composite({
      scorers: [
        exactMatch(),
        llmJudge({ model: mockJudge, rubric: 'Is the answer factually correct?' }),
      ],
      weights: [0.3, 0.7],
    }),
  ],
});

const report = await suite.run();
consoleReporter()(report);
