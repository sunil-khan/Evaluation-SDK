import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCases } from "../../src/loaders/index.js";
import { parseJSON, parseJSONL } from "../../src/loaders/jsonl.js";

// ---------------------------------------------------------------------------
// parseJSONL unit tests
// ---------------------------------------------------------------------------

describe("parseJSONL", () => {
  it("parses multiple JSON objects from JSONL content", () => {
    const content = `{"id":"case-1","input":"hello","output":"world"}\n{"id":"case-2","input":"foo","output":"bar"}`;
    const rows = parseJSONL(content);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: "case-1", input: "hello", output: "world" });
    expect(rows[1]).toEqual({ id: "case-2", input: "foo", output: "bar" });
  });

  it("skips empty lines", () => {
    const content = `{"id":"case-1","input":"hello","output":"world"}\n\n{"id":"case-2","input":"foo","output":"bar"}\n`;
    const rows = parseJSONL(content);
    expect(rows).toHaveLength(2);
  });

  it("throws with line number on invalid JSON", () => {
    const content = `{"id":"case-1","input":"hello","output":"world"}\nbad json here`;
    expect(() => parseJSONL(content)).toThrow(/line 2/);
  });

  it("returns an empty array for empty content", () => {
    expect(parseJSONL("")).toHaveLength(0);
    expect(parseJSONL("\n\n")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseJSON unit tests
// ---------------------------------------------------------------------------

describe("parseJSON", () => {
  it("parses a top-level JSON array", () => {
    const content = JSON.stringify([
      { id: "case-1", input: "hello", output: "world" },
      { id: "case-2", input: "foo", output: "bar" },
    ]);
    const rows = parseJSON(content);
    expect(rows).toHaveLength(2);
  });

  it("throws if the JSON content is not an array", () => {
    expect(() => parseJSON('{"id":"case-1"}')).toThrow(/array/i);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJSON("not json")).toThrow();
  });

  it("returns an empty array for an empty JSON array", () => {
    expect(parseJSON("[]")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// loadCases integration tests (JSONL + JSON + errors)
// ---------------------------------------------------------------------------

async function writeTmpFile(name: string, content: string): Promise<string> {
  const dir = join(tmpdir(), "evalkit-jsonl-test");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, name);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

describe("loadCases (JSONL)", () => {
  it("loads a valid JSONL file into TestCase[]", async () => {
    const content = `{"id":"case-1","input":"hello","output":"world"}\n{"id":"case-2","input":"foo","output":"bar"}`;
    const filePath = await writeTmpFile("valid.jsonl", content);
    const cases = await loadCases(filePath);
    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({ id: "case-1", input: "hello", output: "world" });
  });

  it("maps extra JSONL fields to metadata", async () => {
    const content = `{"id":"case-1","input":"hello","output":"world","category":"tone","priority":1}`;
    const filePath = await writeTmpFile("extra-fields.jsonl", content);
    const cases = await loadCases(filePath);
    expect(cases[0]?.metadata).toEqual({ category: "tone", priority: 1 });
  });

  it("throws with line number on invalid JSONL", async () => {
    const content = `{"id":"case-1","input":"hello","output":"world"}\nbad json`;
    const filePath = await writeTmpFile("bad.jsonl", content);
    await expect(loadCases(filePath)).rejects.toThrow(/line 2/);
  });

  it("throws with line number on validation failure", async () => {
    const content = `{"id":"case-1","input":"hello","output":"world"}\n{"id":"","input":"foo","output":"bar"}`;
    const filePath = await writeTmpFile("invalid-id.jsonl", content);
    await expect(loadCases(filePath)).rejects.toThrow(/line 2/);
  });
});

describe("loadCases (JSON)", () => {
  it("loads a valid JSON file into TestCase[]", async () => {
    const content = JSON.stringify([
      { id: "case-1", input: "hello", output: "world" },
      { id: "case-2", input: "foo", output: "bar" },
    ]);
    const filePath = await writeTmpFile("valid.json", content);
    const cases = await loadCases(filePath);
    expect(cases).toHaveLength(2);
  });

  it("maps extra JSON fields to metadata", async () => {
    const content = JSON.stringify([
      { id: "case-1", input: "hello", output: "world", category: "tone" },
    ]);
    const filePath = await writeTmpFile("extra-fields.json", content);
    const cases = await loadCases(filePath);
    expect(cases[0]?.metadata).toEqual({ category: "tone" });
  });

  it("throws if JSON content is not an array", async () => {
    const content = JSON.stringify({ id: "case-1" });
    const filePath = await writeTmpFile("not-array.json", content);
    await expect(loadCases(filePath)).rejects.toThrow(/array/i);
  });
});

describe("loadCases error handling", () => {
  it("throws when file is not found", async () => {
    await expect(loadCases("/nonexistent/path/cases.csv")).rejects.toThrow(/not found/i);
  });

  it("throws on unsupported file extension", async () => {
    const filePath = await writeTmpFile("cases.xlsx", "data");
    await expect(loadCases(filePath)).rejects.toThrow(/unsupported/i);
  });

  it("throws on unsupported extension with the extension name in the message", async () => {
    const filePath = await writeTmpFile("cases.xlsx", "data");
    await expect(loadCases(filePath)).rejects.toThrow(/\.xlsx/);
  });
});
