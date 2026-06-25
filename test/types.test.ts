import { describe, expect, it } from "vitest";
import { suiteConfigSchema, testCaseSchema } from "../src/types.js";

describe("testCaseSchema", () => {
  it("validates a valid test case", () => {
    const result = testCaseSchema.safeParse({
      id: "case-1",
      input: "What is 2+2?",
      output: "4",
      expected: "4",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty id", () => {
    const result = testCaseSchema.safeParse({
      id: "",
      input: "test",
      output: "test",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Test case id must be a non-empty string");
    }
  });

  it("accepts test case without expected", () => {
    const result = testCaseSchema.safeParse({
      id: "case-1",
      input: "test",
      output: "test",
    });
    expect(result.success).toBe(true);
  });

  it("accepts test case with metadata", () => {
    const result = testCaseSchema.safeParse({
      id: "case-1",
      input: "test",
      output: "test",
      metadata: { category: "tone", priority: 1 },
    });
    expect(result.success).toBe(true);
  });
});

describe("suiteConfigSchema", () => {
  const mockScorer = { name: "test", score: () => Promise.resolve({}) };

  it("validates a valid suite config", () => {
    const result = suiteConfigSchema.safeParse({
      name: "test-suite",
      cases: [{ id: "case-1", input: "hi", output: "hello" }],
      scorers: [mockScorer],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty suite name", () => {
    const result = suiteConfigSchema.safeParse({
      name: "",
      cases: [{ id: "case-1", input: "hi", output: "hello" }],
      scorers: [mockScorer],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Suite name must be a non-empty string");
    }
  });

  it("rejects empty cases array", () => {
    const result = suiteConfigSchema.safeParse({
      name: "test-suite",
      cases: [],
      scorers: [mockScorer],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty scorers array", () => {
    const result = suiteConfigSchema.safeParse({
      name: "test-suite",
      cases: [{ id: "case-1", input: "hi", output: "hello" }],
      scorers: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid passPolicy values", () => {
    for (const policy of ["all", "any"] as const) {
      const result = suiteConfigSchema.safeParse({
        name: "test-suite",
        cases: [{ id: "case-1", input: "hi", output: "hello" }],
        scorers: [mockScorer],
        passPolicy: policy,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid passPolicy", () => {
    const result = suiteConfigSchema.safeParse({
      name: "test-suite",
      cases: [{ id: "case-1", input: "hi", output: "hello" }],
      scorers: [mockScorer],
      passPolicy: "weighted",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive concurrency", () => {
    const result = suiteConfigSchema.safeParse({
      name: "test-suite",
      cases: [{ id: "case-1", input: "hi", output: "hello" }],
      scorers: [mockScorer],
      concurrency: 0,
    });
    expect(result.success).toBe(false);
  });
});
