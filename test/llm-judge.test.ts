import { describe, expect, it } from 'vitest';
import { llmJudge } from '../src/scorers/llm-judge.js';
import type { ChatAdapter, TestCase } from '../src/types.js';

function mockChat(response: string): ChatAdapter {
  return {
    async complete() {
      return { content: response };
    },
  };
}

function mockChatSequence(responses: string[]): ChatAdapter {
  let callIndex = 0;
  return {
    async complete() {
      const response = responses[callIndex] ?? responses[responses.length - 1]!;
      callIndex++;
      return { content: response };
    },
  };
}

const validResponse = JSON.stringify({ reasoning: 'Good answer', score: 4 });

const makeCase = (): TestCase<string, string> => ({
  id: 'judge-1',
  input: 'What is 2+2?',
  output: 'The answer is 4.',
  expected: 'Correct and concise.',
});

describe('llmJudge', () => {
  it('parses valid JSON response and normalizes score', async () => {
    const scorer = llmJudge({
      model: mockChat(validResponse),
      rubric: 'Is the answer correct?',
    });
    const result = await scorer.score(makeCase());

    expect(result.score).toBeCloseTo(0.75); // (4-1)/(5-1) = 0.75
    expect(result.passed).toBe(true); // 0.75 >= 0.6 default threshold
    expect(result.reason).toBe('Good answer');
    expect(result.scorer).toBe('llmJudge');
  });

  it('normalizes with custom scale', async () => {
    const response = JSON.stringify({ reasoning: 'ok', score: 7 });
    const scorer = llmJudge({
      model: mockChat(response),
      rubric: 'test',
      scale: { min: 1, max: 10 },
    });
    const result = await scorer.score(makeCase());
    expect(result.score).toBeCloseTo(0.667, 2); // (7-1)/(10-1) = 0.667
  });

  it('retries on malformed JSON and succeeds', async () => {
    const model = mockChatSequence([
      'I think the score is about 4', // malformed
      validResponse, // valid on retry
    ]);
    const scorer = llmJudge({ model, rubric: 'test', retries: 2 });
    const result = await scorer.score(makeCase());

    expect(result.score).toBeCloseTo(0.75);
    expect(result.error).toBeUndefined();
  });

  it('returns error after all retries exhausted', async () => {
    const model = mockChat('This is not JSON at all');
    const scorer = llmJudge({ model, rubric: 'test', retries: 1 });
    const result = await scorer.score(makeCase());

    expect(result.error).toBeDefined();
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('returns error when adapter throws', async () => {
    const failModel: ChatAdapter = {
      async complete() {
        throw new Error('API timeout');
      },
    };
    const scorer = llmJudge({ model: failModel, rubric: 'test' });
    const result = await scorer.score(makeCase());

    expect(result.error).toBeDefined();
    expect(result.score).toBe(0);
  });

  it('exposes full prompt on raw', async () => {
    const scorer = llmJudge({
      model: mockChat(validResponse),
      rubric: 'Is it good?',
    });
    const result = await scorer.score(makeCase());

    expect(result.raw).toBeDefined();
    const raw = result.raw as { system: string; userMessage: string; response: string };
    expect(raw.system).toContain('Is it good?');
    expect(raw.userMessage).toContain('What is 2+2?');
    expect(raw.response).toBe(validResponse);
  });

  it('uses temperature 0 by default', async () => {
    let capturedTemp: number | undefined;
    const model: ChatAdapter = {
      async complete(params) {
        capturedTemp = params.temperature;
        return { content: validResponse };
      },
    };
    const scorer = llmJudge({ model, rubric: 'test' });
    await scorer.score(makeCase());

    expect(capturedTemp).toBe(0);
  });

  it('respects custom threshold', async () => {
    const response = JSON.stringify({ reasoning: 'ok', score: 2 });
    const scorer = llmJudge({
      model: mockChat(response),
      rubric: 'test',
      threshold: 0.9, // (2-1)/(5-1) = 0.25 < 0.9
    });
    const result = await scorer.score(makeCase());

    expect(result.passed).toBe(false);
  });

  it('respects references option — only sends specified fields', async () => {
    let capturedMessages: unknown;
    const model: ChatAdapter = {
      async complete(params) {
        capturedMessages = params.messages;
        return { content: validResponse };
      },
    };

    const scorer = llmJudge({
      model,
      rubric: 'test',
      references: ['expected'], // only expected, not input
    });
    await scorer.score(makeCase());

    const msgs = capturedMessages as Array<{ content: string }>;
    const userMsg = msgs.find((m) => true)!.content;
    expect(userMsg).toContain('Correct and concise');
    expect(userMsg).not.toContain('What is 2+2?');
  });

  it('tracks latencyMs', async () => {
    const scorer = llmJudge({
      model: mockChat(validResponse),
      rubric: 'test',
    });
    const result = await scorer.score(makeCase());
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
