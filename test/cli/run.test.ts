import { describe, expect, it } from "vitest";
import { runCommand } from "../../src/cli/run.js";
import type { Report } from "../../src/types.js";

// Mock suite that always passes
function makeMockSuiteFile(passRate: number, errored = 0) {
  return {
    run: async (): Promise<Report> => ({
      suite: "mock-suite",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      cases: [
        {
          testCase: { id: "c1", input: "q", output: "a", expected: "a" },
          results: [
            {
              scorer: "mock",
              score: passRate,
              passed: passRate >= 0.5,
              reason: "mock",
              latencyMs: 1,
            },
          ],
          passed: passRate >= 0.5,
        },
      ],
      summary: {
        total: 1,
        passed: passRate >= 0.5 ? 1 : 0,
        failed: passRate < 0.5 ? 1 : 0,
        errored,
        passRate,
        byScorer: { mock: { passRate, avgScore: passRate } },
        avgLatencyMs: 1,
      },
    }),
  };
}

describe("runCommand", () => {
  it("returns exit code 0 for passing suites", async () => {
    const code = await runCommand({
      suites: [makeMockSuiteFile(1.0)],
      config: {
        suites: [],
        reporter: "json",
        verbose: false,
        threshold: undefined,
        output: undefined,
        failOnError: false,
      },
    });
    expect(code).toBe(0);
  });

  it("returns exit code 1 for failing suites", async () => {
    const code = await runCommand({
      suites: [makeMockSuiteFile(0.0)],
      config: {
        suites: [],
        reporter: "json",
        verbose: false,
        threshold: undefined,
        output: undefined,
        failOnError: false,
      },
    });
    expect(code).toBe(1);
  });

  it("returns exit code 1 when below threshold", async () => {
    const code = await runCommand({
      suites: [makeMockSuiteFile(0.7)],
      config: {
        suites: [],
        reporter: "json",
        verbose: false,
        threshold: 0.8,
        output: undefined,
        failOnError: false,
      },
    });
    expect(code).toBe(1);
  });

  it("returns exit code 0 when above threshold", async () => {
    const code = await runCommand({
      suites: [makeMockSuiteFile(0.9)],
      config: {
        suites: [],
        reporter: "json",
        verbose: false,
        threshold: 0.8,
        output: undefined,
        failOnError: false,
      },
    });
    expect(code).toBe(0);
  });

  it("returns exit code 2 when errors and --fail-on-error", async () => {
    const code = await runCommand({
      suites: [makeMockSuiteFile(1.0, 1)],
      config: {
        suites: [],
        reporter: "json",
        verbose: false,
        threshold: undefined,
        output: undefined,
        failOnError: true,
      },
    });
    expect(code).toBe(2);
  });

  it("returns exit code 0 when errors but no --fail-on-error", async () => {
    const code = await runCommand({
      suites: [makeMockSuiteFile(1.0, 1)],
      config: {
        suites: [],
        reporter: "json",
        verbose: false,
        threshold: undefined,
        output: undefined,
        failOnError: false,
      },
    });
    expect(code).toBe(0);
  });

  it("exit code 1 takes precedence over exit code 2", async () => {
    const code = await runCommand({
      suites: [makeMockSuiteFile(0.0, 1)],
      config: {
        suites: [],
        reporter: "json",
        verbose: false,
        threshold: undefined,
        output: undefined,
        failOnError: true,
      },
    });
    expect(code).toBe(1);
  });
});
