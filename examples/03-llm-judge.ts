import { consoleReporter, defineSuite, llmJudge } from '@sunil-khan/evalkit';
import type { ChatAdapter } from '@sunil-khan/evalkit';

// Replace with your real chat adapter (see openai-adapter.ts or anthropic-adapter.ts)
const mockChatAdapter: ChatAdapter = {
  async complete() {
    return {
      content: JSON.stringify({
        reasoning: 'The response is empathetic and offers a concrete next step.',
        score: 4,
      }),
    };
  },
};

const suite = defineSuite({
  name: 'support-bot-tone',
  cases: [
    {
      id: 'refund-1',
      input: 'I want a refund now!!!',
      output:
        "I understand your frustration, and I'm sorry for the inconvenience. Let me look into your order right away and start the refund process. Can you share your order number?",
      expected: 'Empathetic, offers concrete next step, no false promises.',
    },
  ],
  scorers: [
    llmJudge({
      model: mockChatAdapter,
      rubric:
        'Response is empathetic, gives a concrete next step, and makes no commitment it cannot keep.',
    }),
  ],
});

const report = await suite.run();
consoleReporter({ verbose: true })(report);
