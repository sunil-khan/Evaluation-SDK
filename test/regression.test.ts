import { describe, expect, it } from "vitest";
import { compareReports, formatRegressionSummary } from "../src/regression.js";
import type { Report } from "../src/types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReport(
  cases: Array<{
    id: string;
    passed: boolean;
    scores: Record<string, number>;
  }>,
  suiteName = "test-suite",
): Report {
  const caseReports = cases.map(({ id, passed, scores }) => ({
    testCase: { id, input: "q", output: "a" },
    results: Object.entries(scores).map(([scorer, score]) => ({
      scorer,
      score,
      passed: score >= 0.5,
      latencyMs: 1,
    })),
    passed,
  }));

  const total = caseReports.length;
  const passed = caseReports.filter((c) => c.passed).length;

  // Build byScorer averages
  const scorerTotals: Record<string, { sum: number; count: number }> = {};
  for (const c of caseReports) {
    for (const r of c.results) {
      if (!scorerTotals[r.scorer]) scorerTotals[r.scorer] = { sum: 0, count: 0 };
      scorerTotals[r.scorer]!.sum += r.score;
      scorerTotals[r.scorer]!.count += 1;
    }
  }
  const byScorer: Record<string, { passRate: number; avgScore: number }> = {};
  for (const [name, { sum, count }] of Object.entries(scorerTotals)) {
    const avg = sum / count;
    byScorer[name] = { passRate: avg, avgScore: avg };
  }

  return {
    suite: suiteName,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    cases: caseReports,
    summary: {
      total,
      passed,
      failed: total - passed,
      errored: 0,
      passRate: total > 0 ? passed / total : 0,
      byScorer,
      avgLatencyMs: 1,
    },
  };
}

// ─── compareReports ───────────────────────────────────────────────────────────

describe("compareReports", () => {
  describe("pass rate regression", () => {
    it("detects regression when pass rate drops", () => {
      const baseline = makeReport([
        { id: "c1", passed: true, scores: { s: 1 } },
        { id: "c2", passed: true, scores: { s: 1 } },
      ]);
      const current = makeReport([
        { id: "c1", passed: false, scores: { s: 0 } },
        { id: "c2", passed: true, scores: { s: 1 } },
      ]);
      const result = compareReports(current, baseline);
      expect(result.regressed).toBe(true);
      expect(result.passRate.baseline).toBe(1.0);
      expect(result.passRate.current).toBe(0.5);
      expect(result.passRate.delta).toBeCloseTo(-0.5);
      expect(result.passRate.regressed).toBe(true);
    });

    it("no regression when pass rate stays the same", () => {
      const report = makeReport([
        { id: "c1", passed: true, scores: { s: 1 } },
        { id: "c2", passed: true, scores: { s: 1 } },
      ]);
      const result = compareReports(report, report);
      expect(result.regressed).toBe(false);
      expect(result.passRate.regressed).toBe(false);
    });

    it("no regression when pass rate improves", () => {
      const baseline = makeReport([
        { id: "c1", passed: false, scores: { s: 0 } },
        { id: "c2", passed: true, scores: { s: 1 } },
      ]);
      const current = makeReport([
        { id: "c1", passed: true, scores: { s: 1 } },
        { id: "c2", passed: true, scores: { s: 1 } },
      ]);
      const result = compareReports(current, baseline);
      expect(result.regressed).toBe(false);
      expect(result.passRate.regressed).toBe(false);
    });
  });

  describe("tolerance", () => {
    it("no regression when drop is within tolerance", () => {
      const baseline = makeReport([
        { id: "c1", passed: true, scores: { s: 1 } },
        { id: "c2", passed: true, scores: { s: 1 } },
        { id: "c3", passed: true, scores: { s: 1 } },
        { id: "c4", passed: true, scores: { s: 1 } },
        { id: "c5", passed: true, scores: { s: 1 } },
        { id: "c6", passed: true, scores: { s: 1 } },
        { id: "c7", passed: true, scores: { s: 1 } },
        { id: "c8", passed: true, scores: { s: 1 } },
        { id: "c9", passed: true, scores: { s: 1 } },
        { id: "c10", passed: true, scores: { s: 1 } },
      ]);
      // Drop from 1.0 to 0.9 (10% drop) — tolerance is 0.1 so exactly at boundary
      const current = makeReport([
        { id: "c1", passed: false, scores: { s: 0 } },
        { id: "c2", passed: true, scores: { s: 1 } },
        { id: "c3", passed: true, scores: { s: 1 } },
        { id: "c4", passed: true, scores: { s: 1 } },
        { id: "c5", passed: true, scores: { s: 1 } },
        { id: "c6", passed: true, scores: { s: 1 } },
        { id: "c7", passed: true, scores: { s: 1 } },
        { id: "c8", passed: true, scores: { s: 1 } },
        { id: "c9", passed: true, scores: { s: 1 } },
        { id: "c10", passed: true, scores: { s: 1 } },
      ]);
      // Drop is 0.1. Tolerance is 0.1. Regression only if drop > tolerance.
      const result = compareReports(current, baseline, { tolerance: 0.1 });
      expect(result.passRate.regressed).toBe(false);
    });

    it("regression when drop exceeds tolerance", () => {
      const baseline = makeReport([
        { id: "c1", passed: true, scores: { s: 1 } },
        { id: "c2", passed: true, scores: { s: 1 } },
        { id: "c3", passed: true, scores: { s: 1 } },
        { id: "c4", passed: true, scores: { s: 1 } },
        { id: "c5", passed: true, scores: { s: 1 } },
      ]);
      const current = makeReport([
        { id: "c1", passed: false, scores: { s: 0 } },
        { id: "c2", passed: false, scores: { s: 0 } },
        { id: "c3", passed: true, scores: { s: 1 } },
        { id: "c4", passed: true, scores: { s: 1 } },
        { id: "c5", passed: true, scores: { s: 1 } },
      ]);
      // Drop is 0.4, tolerance is 0.1 — regression
      const result = compareReports(current, baseline, { tolerance: 0.1 });
      expect(result.passRate.regressed).toBe(true);
    });

    it("tolerance = 0 means any drop is a regression (default)", () => {
      const baseline = makeReport([
        { id: "c1", passed: true, scores: { s: 1 } },
        { id: "c2", passed: true, scores: { s: 1 } },
      ]);
      const current = makeReport([
        { id: "c1", passed: false, scores: { s: 0 } },
        { id: "c2", passed: true, scores: { s: 1 } },
      ]);
      // Default tolerance is 0
      const result = compareReports(current, baseline);
      expect(result.passRate.regressed).toBe(true);
    });
  });

  describe("flipped cases", () => {
    it("detects pass → fail flips", () => {
      const baseline = makeReport([
        { id: "refund-3", passed: true, scores: { exactMatch: 1.0 } },
        { id: "complaint-2", passed: true, scores: { llmJudge: 0.8 } },
      ]);
      const current = makeReport([
        { id: "refund-3", passed: false, scores: { exactMatch: 0.0 } },
        { id: "complaint-2", passed: false, scores: { llmJudge: 0.4 } },
      ]);
      const result = compareReports(current, baseline);
      expect(result.flippedCases).toHaveLength(2);
      const refund = result.flippedCases.find((c) => c.caseId === "refund-3");
      expect(refund).toBeDefined();
      expect(refund?.baselineScores.exactMatch).toBe(1.0);
      expect(refund?.currentScores.exactMatch).toBe(0.0);
    });

    it("does not flag fail → pass as regression", () => {
      const baseline = makeReport([
        { id: "c1", passed: false, scores: { s: 0.0 } },
      ]);
      const current = makeReport([
        { id: "c1", passed: true, scores: { s: 1.0 } },
      ]);
      const result = compareReports(current, baseline);
      expect(result.flippedCases).toHaveLength(0);
      expect(result.regressed).toBe(false);
    });

    it("regression = true when a case flips even if pass rate holds", () => {
      // c1 flips pass→fail, c2 flips fail→pass: overall pass rate unchanged
      const baseline = makeReport([
        { id: "c1", passed: true, scores: { s: 1.0 } },
        { id: "c2", passed: false, scores: { s: 0.0 } },
      ]);
      const current = makeReport([
        { id: "c1", passed: false, scores: { s: 0.0 } },
        { id: "c2", passed: true, scores: { s: 1.0 } },
      ]);
      const result = compareReports(current, baseline);
      expect(result.flippedCases).toHaveLength(1);
      expect(result.flippedCases[0]?.caseId).toBe("c1");
      expect(result.regressed).toBe(true);
    });
  });

  describe("scorer changes", () => {
    it("detects scorer average drop", () => {
      const baseline = makeReport([
        { id: "c1", passed: true, scores: { exactMatch: 0.9 } },
        { id: "c2", passed: true, scores: { exactMatch: 0.8 } },
      ]);
      const current = makeReport([
        { id: "c1", passed: true, scores: { exactMatch: 0.7 } },
        { id: "c2", passed: true, scores: { exactMatch: 0.6 } },
      ]);
      // avgScore: baseline = 0.85, current = 0.65, drop = 0.2
      const result = compareReports(current, baseline);
      expect(result.scorerChanges.exactMatch).toBeDefined();
      expect(result.scorerChanges.exactMatch?.regressed).toBe(true);
      expect(result.regressed).toBe(true);
    });

    it("scorer improvement does not cause regression", () => {
      const baseline = makeReport([
        { id: "c1", passed: true, scores: { s: 0.6 } },
      ]);
      const current = makeReport([
        { id: "c1", passed: true, scores: { s: 0.9 } },
      ]);
      const result = compareReports(current, baseline);
      expect(result.scorerChanges.s?.regressed).toBe(false);
      expect(result.regressed).toBe(false);
    });

    it("scorer drop within tolerance is not a regression", () => {
      const baseline = makeReport([
        { id: "c1", passed: true, scores: { s: 0.85 } },
      ]);
      const current = makeReport([
        { id: "c1", passed: true, scores: { s: 0.84 } },
      ]);
      // Drop is 0.01, tolerance is 0.02 — no regression
      const result = compareReports(current, baseline, { tolerance: 0.02 });
      expect(result.scorerChanges.s?.regressed).toBe(false);
      expect(result.regressed).toBe(false);
    });

    it("records correct baseline, current, and delta values", () => {
      const baseline = makeReport([
        { id: "c1", passed: true, scores: { exactMatch: 0.85, llmJudge: 0.78 } },
      ]);
      const current = makeReport([
        { id: "c1", passed: true, scores: { exactMatch: 0.75, llmJudge: 0.8 } },
      ]);
      const result = compareReports(current, baseline);
      expect(result.scorerChanges.exactMatch?.baseline).toBeCloseTo(0.85);
      expect(result.scorerChanges.exactMatch?.current).toBeCloseTo(0.75);
      expect(result.scorerChanges.exactMatch?.delta).toBeCloseTo(-0.1);
      expect(result.scorerChanges.llmJudge?.baseline).toBeCloseTo(0.78);
      expect(result.scorerChanges.llmJudge?.current).toBeCloseTo(0.8);
      expect(result.scorerChanges.llmJudge?.delta).toBeCloseTo(0.02);
    });
  });

  describe("new and removed cases", () => {
    it("tracks new cases (in current but not baseline)", () => {
      const baseline = makeReport([{ id: "c1", passed: true, scores: { s: 1 } }]);
      const current = makeReport([
        { id: "c1", passed: true, scores: { s: 1 } },
        { id: "c2-new", passed: true, scores: { s: 1 } },
      ]);
      const result = compareReports(current, baseline);
      expect(result.newCases).toContain("c2-new");
      expect(result.newCases).toHaveLength(1);
    });

    it("tracks removed cases (in baseline but not current)", () => {
      const baseline = makeReport([
        { id: "c1", passed: true, scores: { s: 1 } },
        { id: "c2-removed", passed: true, scores: { s: 1 } },
      ]);
      const current = makeReport([{ id: "c1", passed: true, scores: { s: 1 } }]);
      const result = compareReports(current, baseline);
      expect(result.removedCases).toContain("c2-removed");
      expect(result.removedCases).toHaveLength(1);
    });

    it("new cases alone are not a regression", () => {
      const baseline = makeReport([{ id: "c1", passed: true, scores: { s: 1 } }]);
      const current = makeReport([
        { id: "c1", passed: true, scores: { s: 1 } },
        { id: "c2-new", passed: true, scores: { s: 1 } },
      ]);
      const result = compareReports(current, baseline);
      expect(result.regressed).toBe(false);
    });
  });

  describe("no regression when everything improved", () => {
    it("returns regressed=false when all metrics improve", () => {
      const baseline = makeReport([
        { id: "c1", passed: false, scores: { s: 0.4 } },
        { id: "c2", passed: false, scores: { s: 0.3 } },
      ]);
      const current = makeReport([
        { id: "c1", passed: true, scores: { s: 0.9 } },
        { id: "c2", passed: true, scores: { s: 0.8 } },
      ]);
      const result = compareReports(current, baseline);
      expect(result.regressed).toBe(false);
      expect(result.flippedCases).toHaveLength(0);
      expect(result.passRate.regressed).toBe(false);
    });
  });
});

// ─── formatRegressionSummary ──────────────────────────────────────────────────

describe("formatRegressionSummary", () => {
  it("includes regression header", () => {
    const result = compareReports(
      makeReport([{ id: "c1", passed: true, scores: { s: 1 } }]),
      makeReport([{ id: "c1", passed: true, scores: { s: 1 } }]),
    );
    const summary = formatRegressionSummary(result);
    expect(summary).toContain("Regression Report");
  });

  it("shows REGRESSED when regression detected", () => {
    const baseline = makeReport([
      { id: "c1", passed: true, scores: { s: 1 } },
      { id: "c2", passed: true, scores: { s: 1 } },
    ]);
    const current = makeReport([
      { id: "c1", passed: false, scores: { s: 0 } },
      { id: "c2", passed: true, scores: { s: 1 } },
    ]);
    const summary = formatRegressionSummary(compareReports(current, baseline));
    expect(summary).toContain("REGRESSED");
  });

  it("shows No regressions detected when none", () => {
    const report = makeReport([{ id: "c1", passed: true, scores: { s: 1 } }]);
    const summary = formatRegressionSummary(compareReports(report, report));
    expect(summary).toContain("No regressions detected");
  });

  it("shows flipped cases section when cases flipped", () => {
    const baseline = makeReport([{ id: "refund-3", passed: true, scores: { exactMatch: 1.0 } }]);
    const current = makeReport([{ id: "refund-3", passed: false, scores: { exactMatch: 0.0 } }]);
    const summary = formatRegressionSummary(compareReports(current, baseline));
    expect(summary).toContain("refund-3");
    expect(summary).toContain("PASS → FAIL");
  });

  it("shows scorer changes section", () => {
    const baseline = makeReport([{ id: "c1", passed: true, scores: { exactMatch: 0.9 } }]);
    const current = makeReport([{ id: "c1", passed: true, scores: { exactMatch: 0.7 } }]);
    const summary = formatRegressionSummary(compareReports(current, baseline));
    expect(summary).toContain("exactMatch");
    expect(summary).toContain("Scorer changes");
  });

  it("shows new cases count", () => {
    const baseline = makeReport([{ id: "c1", passed: true, scores: { s: 1 } }]);
    const current = makeReport([
      { id: "c1", passed: true, scores: { s: 1 } },
      { id: "c2", passed: true, scores: { s: 1 } },
    ]);
    const summary = formatRegressionSummary(compareReports(current, baseline));
    expect(summary).toContain("New cases");
  });

  it("uses ▲ for improvements and ▼ for regressions in pass rate line", () => {
    const baseline = makeReport([
      { id: "c1", passed: true, scores: { s: 1 } },
      { id: "c2", passed: true, scores: { s: 1 } },
    ]);
    const current = makeReport([
      { id: "c1", passed: false, scores: { s: 0 } },
      { id: "c2", passed: true, scores: { s: 1 } },
    ]);
    const regressionSummary = formatRegressionSummary(compareReports(current, baseline));
    expect(regressionSummary).toContain("▼");

    const improved = makeReport([
      { id: "c1", passed: true, scores: { s: 1 } },
      { id: "c2", passed: true, scores: { s: 1 } },
    ]);
    const improvementSummary = formatRegressionSummary(compareReports(improved, baseline));
    // No change or improvement
    expect(improvementSummary).not.toContain("▼");
  });
});
