import { describe, expect, it } from "vitest";
import { runCases } from "../src/runner.js";
import type { ProgressEvent, Scorer, TestCase } from "../src/types.js";

function makeCase(id: string): TestCase<string, string> {
  return { id, input: "q", output: "a", expected: "a" };
}

function makeDelayScorer(name: string, delayMs: number, score = 1): Scorer {
  return {
    name,
    async score() {
      await new Promise((r) => setTimeout(r, delayMs));
      return { scorer: name, score, passed: score >= 0.5, reason: "ok", latencyMs: delayMs };
    },
  };
}

function makeFailingScorer(name: string): Scorer {
  return {
    name,
    async score() {
      throw new Error(`${name} exploded`);
    },
  };
}

describe("runCases", () => {
  it("runs all cases and returns CaseReports in original order", async () => {
    const cases = [makeCase("c1"), makeCase("c2"), makeCase("c3")];
    const scorers = [makeDelayScorer("fast", 1)];
    const results = await runCases({ cases, scorers, concurrency: 2, passPolicy: "all" });

    expect(results).toHaveLength(3);
    expect(results[0]?.testCase.id).toBe("c1");
    expect(results[1]?.testCase.id).toBe("c2");
    expect(results[2]?.testCase.id).toBe("c3");
  });

  it("respects bounded concurrency", async () => {
    let running = 0;
    let maxRunning = 0;

    const trackingScorer: Scorer = {
      name: "tracker",
      async score() {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 100));
        running--;
        return { scorer: "tracker", score: 1, passed: true, reason: "ok", latencyMs: 100 };
      },
    };

    const cases = Array.from({ length: 8 }, (_, i) => makeCase(`c${i}`));
    await runCases({ cases, scorers: [trackingScorer], concurrency: 3, passPolicy: "all" });

    expect(maxRunning).toBeLessThanOrEqual(3);
    expect(maxRunning).toBeGreaterThan(1); // actually ran concurrently
  });

  it("isolates scorer errors — other scorers and cases continue", async () => {
    const cases = [makeCase("c1"), makeCase("c2")];
    const scorers = [makeDelayScorer("good", 1), makeFailingScorer("bad")];
    const results = await runCases({ cases, scorers, concurrency: 4, passPolicy: "all" });

    expect(results).toHaveLength(2);

    // Both cases have 2 results
    for (const report of results) {
      expect(report.results).toHaveLength(2);
      const goodResult = report.results.find((r) => r.scorer === "good");
      const badResult = report.results.find((r) => r.scorer === "bad");
      expect(goodResult?.score).toBe(1);
      expect(badResult?.error).toBeDefined();
      expect(badResult?.score).toBe(0);
    }
  });

  it("emits progress events", async () => {
    const events: ProgressEvent[] = [];
    const cases = [makeCase("c1"), makeCase("c2")];
    const scorers = [makeDelayScorer("s", 1)];

    await runCases({
      cases,
      scorers,
      concurrency: 1,
      passPolicy: "all",
      onProgress: (e) => events.push(e),
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.completed).toBe(1);
    expect(events[0]?.total).toBe(2);
    expect(events[1]?.completed).toBe(2);
    expect(events[1]?.total).toBe(2);
  });

  it('determines case pass/fail based on passPolicy "all"', async () => {
    const cases = [makeCase("c1")];
    const scorers = [makeDelayScorer("pass", 1, 1), makeDelayScorer("fail", 1, 0)];
    const results = await runCases({ cases, scorers, concurrency: 4, passPolicy: "all" });

    expect(results[0]?.passed).toBe(false); // 'fail' scorer didn't pass
  });

  it('determines case pass/fail based on passPolicy "any"', async () => {
    const cases = [makeCase("c1")];
    const scorers = [makeDelayScorer("pass", 1, 1), makeDelayScorer("fail", 1, 0)];
    const results = await runCases({ cases, scorers, concurrency: 4, passPolicy: "any" });

    expect(results[0]?.passed).toBe(true); // at least one passed
  });
});
