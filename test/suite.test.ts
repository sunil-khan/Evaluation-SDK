import { describe, expect, it } from "vitest";
import { ConfigError } from "../src/errors.js";
import { defineSuite } from "../src/suite.js";
import type { Scorer, TestCase } from "../src/types.js";

const passingScorer: Scorer = {
  name: "always-pass",
  async score(_tc) {
    return { scorer: "always-pass", score: 1, passed: true, reason: "pass", latencyMs: 1 };
  },
};

const failingScorer: Scorer = {
  name: "always-fail",
  async score(_tc) {
    return { scorer: "always-fail", score: 0, passed: false, reason: "fail", latencyMs: 1 };
  },
};

const makeCase = (id: string): TestCase => ({
  id,
  input: "q",
  output: "a",
  expected: "a",
});

describe("defineSuite", () => {
  it("throws ConfigError for empty suite name", () => {
    expect(() =>
      defineSuite({ name: "", cases: [makeCase("c1")], scorers: [passingScorer] }),
    ).toThrow(ConfigError);
  });

  it("throws ConfigError for empty cases", () => {
    expect(() => defineSuite({ name: "test", cases: [], scorers: [passingScorer] })).toThrow(
      ConfigError,
    );
  });

  it("throws ConfigError for empty scorers", () => {
    expect(() => defineSuite({ name: "test", cases: [makeCase("c1")], scorers: [] })).toThrow(
      ConfigError,
    );
  });

  it("creates a valid suite and runs it", async () => {
    const suite = defineSuite({
      name: "test-suite",
      cases: [makeCase("c1"), makeCase("c2")],
      scorers: [passingScorer],
    });

    const report = await suite.run();

    expect(report.suite).toBe("test-suite");
    expect(report.cases).toHaveLength(2);
    expect(report.summary.total).toBe(2);
    expect(report.summary.passed).toBe(2);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.passRate).toBe(1);
    expect(report.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("computes byScorer statistics", async () => {
    const suite = defineSuite({
      name: "stats-suite",
      cases: [makeCase("c1"), makeCase("c2")],
      scorers: [passingScorer, failingScorer],
    });

    const report = await suite.run();

    expect(report.summary.byScorer["always-pass"]?.passRate).toBe(1);
    expect(report.summary.byScorer["always-pass"]?.avgScore).toBe(1);
    expect(report.summary.byScorer["always-fail"]?.passRate).toBe(0);
    expect(report.summary.byScorer["always-fail"]?.avgScore).toBe(0);
  });

  it('uses passPolicy "all" by default', async () => {
    const suite = defineSuite({
      name: "policy-test",
      cases: [makeCase("c1")],
      scorers: [passingScorer, failingScorer],
    });

    const report = await suite.run();
    expect(report.cases[0]?.passed).toBe(false); // one failed, so case fails
    expect(report.summary.passed).toBe(0);
  });

  it('supports passPolicy "any"', async () => {
    const suite = defineSuite({
      name: "policy-any",
      cases: [makeCase("c1")],
      scorers: [passingScorer, failingScorer],
      passPolicy: "any",
    });

    const report = await suite.run();
    expect(report.cases[0]?.passed).toBe(true); // one passed
    expect(report.summary.passed).toBe(1);
  });

  it("counts errored cases correctly", async () => {
    const errorScorer: Scorer = {
      name: "error-scorer",
      async score() {
        throw new Error("boom");
      },
    };

    const suite = defineSuite({
      name: "error-suite",
      cases: [makeCase("c1"), makeCase("c2")],
      scorers: [passingScorer, errorScorer],
    });

    const report = await suite.run();
    expect(report.summary.errored).toBe(2); // both cases have an errored scorer
    expect(report.summary.passed).toBe(0); // passPolicy 'all' — error means not passed
  });

  it("defaults concurrency to 4", async () => {
    const suite = defineSuite({
      name: "concurrency-test",
      cases: [makeCase("c1")],
      scorers: [passingScorer],
    });

    // Just verifying it runs without error at default concurrency
    const report = await suite.run();
    expect(report.summary.total).toBe(1);
  });
});
