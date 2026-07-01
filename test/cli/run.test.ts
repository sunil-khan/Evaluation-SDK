import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
        baseline: undefined,
        regressionTolerance: undefined,
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
        baseline: undefined,
        regressionTolerance: undefined,
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
        baseline: undefined,
        regressionTolerance: undefined,
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
        baseline: undefined,
        regressionTolerance: undefined,
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
        baseline: undefined,
        regressionTolerance: undefined,
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
        baseline: undefined,
        regressionTolerance: undefined,
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
        baseline: undefined,
        regressionTolerance: undefined,
      },
    });
    expect(code).toBe(1);
  });

  describe("--baseline flag", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evalkit-baseline-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true });
    });

    function makeBaselineReport(passRate: number): Report {
      return {
        suite: "mock-suite",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        cases: [
          {
            testCase: { id: "c1", input: "q", output: "a" },
            results: [{ scorer: "mock", score: passRate, passed: passRate >= 0.5, latencyMs: 1 }],
            passed: passRate >= 0.5,
          },
        ],
        summary: {
          total: 1,
          passed: passRate >= 0.5 ? 1 : 0,
          failed: passRate < 0.5 ? 1 : 0,
          errored: 0,
          passRate,
          byScorer: { mock: { passRate, avgScore: passRate } },
          avgLatencyMs: 1,
        },
      };
    }

    it("run with baseline — no regression → exit 0", async () => {
      const baselinePath = path.join(tmpDir, "baseline.json");
      fs.writeFileSync(baselinePath, JSON.stringify(makeBaselineReport(1.0)));

      const code = await runCommand({
        suites: [makeMockSuiteFile(1.0)],
        config: {
          suites: [],
          reporter: "json",
          verbose: false,
          threshold: undefined,
          output: undefined,
          failOnError: false,
          baseline: baselinePath,
          regressionTolerance: undefined,
        },
      });
      expect(code).toBe(0);
    });

    it("run with baseline — regression detected → exit 1", async () => {
      const baselinePath = path.join(tmpDir, "baseline.json");
      // Baseline has 100% pass rate, current will have 0%
      fs.writeFileSync(baselinePath, JSON.stringify(makeBaselineReport(1.0)));

      const code = await runCommand({
        suites: [makeMockSuiteFile(0.0)],
        config: {
          suites: [],
          reporter: "json",
          verbose: false,
          threshold: undefined,
          output: undefined,
          failOnError: false,
          baseline: baselinePath,
          regressionTolerance: undefined,
        },
      });
      expect(code).toBe(1);
    });

    it("throws when baseline file not found", async () => {
      await expect(
        runCommand({
          suites: [makeMockSuiteFile(1.0)],
          config: {
            suites: [],
            reporter: "json",
            verbose: false,
            threshold: undefined,
            output: undefined,
            failOnError: false,
            baseline: path.join(tmpDir, "nonexistent.json"),
            regressionTolerance: undefined,
          },
        }),
      ).rejects.toThrow("Baseline file not found");
    });

    it("throws when baseline file is invalid JSON", async () => {
      const baselinePath = path.join(tmpDir, "bad.json");
      fs.writeFileSync(baselinePath, "not valid json {{{");

      await expect(
        runCommand({
          suites: [makeMockSuiteFile(1.0)],
          config: {
            suites: [],
            reporter: "json",
            verbose: false,
            threshold: undefined,
            output: undefined,
            failOnError: false,
            baseline: baselinePath,
            regressionTolerance: undefined,
          },
        }),
      ).rejects.toThrow("Baseline file is not valid Report JSON");
    });
  });
});
