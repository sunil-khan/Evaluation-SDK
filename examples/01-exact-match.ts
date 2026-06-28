import { consoleReporter, defineSuite, exactMatch } from '@sunil-khan/evalkit';

const suite = defineSuite({
  name: 'exact-match-demo',
  cases: [
    {
      id: 'greeting',
      input: 'Say hello',
      output: 'Hello, World!',
      expected: 'Hello, World!',
    },
    {
      id: 'math',
      input: 'What is 2+2?',
      output: 'The answer is 4',
      expected: 'the answer is 4',
    },
    {
      id: 'mismatch',
      input: 'Say goodbye',
      output: 'See you later!',
      expected: 'Goodbye!',
    },
  ],
  scorers: [exactMatch()],
});

const report = await suite.run();
consoleReporter()(report);
