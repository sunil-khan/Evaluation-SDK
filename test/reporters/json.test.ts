import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { jsonReporter } from '../../src/reporters/json.js';
import type { Report } from '../../src/types.js';

function makeReport(): Report {
  return {
    suite: 'test-suite',
    startedAt: '2026-06-25T10:00:00.000Z',
    finishedAt: '2026-06-25T10:00:01.000Z',
    cases: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      errored: 0,
      passRate: 0,
      byScorer: {},
      avgLatencyMs: 0,
    },
  };
}

describe('jsonReporter', () => {
  const tmpDir = path.join(os.tmpdir(), `evalkit-test-${Date.now()}`);

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('writes valid JSON to the specified path', async () => {
    const filePath = path.join(tmpDir, 'report.json');
    const reporter = jsonReporter(filePath);
    await reporter(makeReport());

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.suite).toBe('test-suite');
  });

  it('creates parent directories if they do not exist', async () => {
    const filePath = path.join(tmpDir, 'nested', 'deep', 'report.json');
    const reporter = jsonReporter(filePath);
    await reporter(makeReport());

    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('writes well-formatted JSON (2-space indent)', async () => {
    const filePath = path.join(tmpDir, 'formatted.json');
    const reporter = jsonReporter(filePath);
    await reporter(makeReport());

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('  "suite"');
  });
});
