import { describe, expect, it, vi } from 'vitest';
import { consoleReporter } from '../../src/reporters/console.js';
import type { Report } from '../../src/types.js';

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    suite: 'test-suite',
    startedAt: '2026-06-25T10:00:00.000Z',
    finishedAt: '2026-06-25T10:00:01.000Z',
    cases: [
      {
        testCase: { id: 'c1', input: 'q', output: 'a', expected: 'a' },
        results: [
          { scorer: 'exactMatch', score: 1, passed: true, reason: 'Exact match.', latencyMs: 1 },
        ],
        passed: true,
      },
      {
        testCase: { id: 'c2', input: 'q', output: 'b', expected: 'a' },
        results: [
          {
            scorer: 'exactMatch',
            score: 0,
            passed: false,
            reason: 'Strings differ at index 0',
            latencyMs: 1,
          },
        ],
        passed: false,
      },
    ],
    summary: {
      total: 2,
      passed: 1,
      failed: 1,
      errored: 0,
      passRate: 0.5,
      byScorer: { exactMatch: { passRate: 0.5, avgScore: 0.5 } },
      avgLatencyMs: 1,
    },
    ...overrides,
  };
}

describe('consoleReporter', () => {
  it('writes formatted output to stdout', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const reporter = consoleReporter();
    reporter(makeReport());

    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('test-suite');
    expect(output).toContain('c1');
    expect(output).toContain('c2');
    expect(output).toContain('PASS');
    expect(output).toContain('FAIL');
    expect(output).toContain('50.0%');

    writeSpy.mockRestore();
  });

  it('shows failed case reasons', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const reporter = consoleReporter();
    reporter(makeReport());

    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('Strings differ at index 0');

    writeSpy.mockRestore();
  });

  it('shows verbose detail when verbose: true', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const reporter = consoleReporter({ verbose: true });
    reporter(makeReport());

    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    // Verbose-only content: detailed per-case breakdown with score= and reason=
    expect(output).toContain('Detailed Results');
    expect(output).toContain('score=');
    expect(output).toContain('reason=');

    writeSpy.mockRestore();
  });
});
