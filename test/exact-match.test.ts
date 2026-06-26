import { describe, expect, it } from "vitest";
import { exactMatch } from "../src/scorers/exact-match.js";
import type { TestCase } from "../src/types.js";

describe("exactMatch", () => {
  const scorer = exactMatch();

  it("returns score 1 for matching strings", async () => {
    const tc: TestCase<string, string> = {
      id: "match-1",
      input: "question",
      output: "hello world",
      expected: "hello world",
    };
    const result = await scorer.score(tc);
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.scorer).toBe("exactMatch");
  });

  it("returns score 0 for non-matching strings", async () => {
    const tc: TestCase<string, string> = {
      id: "no-match-1",
      input: "question",
      output: "hello world",
      expected: "goodbye world",
    };
    const result = await scorer.score(tc);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("normalizes by default (trim, lowercase, collapse whitespace)", async () => {
    const tc: TestCase<string, string> = {
      id: "normalize-1",
      input: "question",
      output: "  Hello   World  ",
      expected: "hello world",
    };
    const result = await scorer.score(tc);
    expect(result.score).toBe(1);
    expect(result.passed).toBe(true);
  });

  it("respects normalize: false", async () => {
    const strict = exactMatch({ normalize: false });
    const tc: TestCase<string, string> = {
      id: "strict-1",
      input: "question",
      output: "  Hello World  ",
      expected: "Hello World",
    };
    const result = await strict.score(tc);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("ignores punctuation when option is set", async () => {
    const scorer = exactMatch({ ignorePunctuation: true });
    const tc: TestCase<string, string> = {
      id: "punct-1",
      input: "question",
      output: "hello, world!",
      expected: "hello world",
    };
    const result = await scorer.score(tc);
    expect(result.score).toBe(1);
  });

  it("returns error when expected is undefined", async () => {
    const tc: TestCase<string, string> = {
      id: "no-expected",
      input: "question",
      output: "hello",
    };
    const result = await scorer.score(tc);
    expect(result.error).toBeDefined();
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("reports first divergence point in reason", async () => {
    const tc: TestCase<string, string> = {
      id: "diverge-1",
      input: "question",
      output: "hello world",
      expected: "hello mars",
    };
    const result = await scorer.score(tc);
    expect(result.score).toBe(0);
    expect(result.reason).toContain("index");
  });

  it("tracks latencyMs", async () => {
    const tc: TestCase<string, string> = {
      id: "latency-1",
      input: "question",
      output: "test",
      expected: "test",
    };
    const result = await scorer.score(tc);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
