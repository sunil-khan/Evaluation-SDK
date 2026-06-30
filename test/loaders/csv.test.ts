import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCSV } from "../../src/loaders/csv.js";
import { loadCases } from "../../src/loaders/index.js";

// ---------------------------------------------------------------------------
// parseCSV unit tests
// ---------------------------------------------------------------------------

describe("parseCSV", () => {
  it("parses a simple CSV with header", () => {
    const content = "id,input,output\ncase-1,hello,world\ncase-2,foo,bar";
    const rows = parseCSV(content);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: "case-1", input: "hello", output: "world" });
    expect(rows[1]).toEqual({ id: "case-2", input: "foo", output: "bar" });
  });

  it("skips empty lines", () => {
    const content = "id,input,output\ncase-1,hello,world\n\ncase-2,foo,bar\n";
    const rows = parseCSV(content);
    expect(rows).toHaveLength(2);
  });

  it("handles quoted fields containing commas", () => {
    const content = `id,input,output\ncase-1,"hello, world","foo, bar"`;
    const rows = parseCSV(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: "case-1", input: "hello, world", output: "foo, bar" });
  });

  it("handles double-quote escaping inside quoted fields", () => {
    const content = `id,input,output\ncase-1,"he said ""hi""","she said ""bye"""`;
    const rows = parseCSV(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: "case-1", input: 'he said "hi"', output: 'she said "bye"' });
  });

  it("supports custom delimiter (tab)", () => {
    const content = "id\tinput\toutput\ncase-1\thello\tworld";
    const rows = parseCSV(content, "\t");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: "case-1", input: "hello", output: "world" });
  });

  it("includes extra columns in the result record", () => {
    const content = "id,input,output,category,priority\ncase-1,hello,world,tone,1";
    const rows = parseCSV(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: "case-1",
      input: "hello",
      output: "world",
      category: "tone",
      priority: "1",
    });
  });

  it("handles the optional expected column", () => {
    const content = "id,input,output,expected\ncase-1,hello,world,golden";
    const rows = parseCSV(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: "case-1", input: "hello", output: "world", expected: "golden" });
  });

  it("handles Windows-style CRLF line endings", () => {
    const content = "id,input,output\r\ncase-1,hello,world\r\ncase-2,foo,bar";
    const rows = parseCSV(content);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: "case-1", input: "hello", output: "world" });
  });
});

// ---------------------------------------------------------------------------
// loadCases CSV integration tests
// ---------------------------------------------------------------------------

async function writeTmpFile(name: string, content: string): Promise<string> {
  const dir = join(tmpdir(), "evalkit-csv-test");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, name);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

describe("loadCases (CSV)", () => {
  it("loads a valid CSV file into TestCase[]", async () => {
    const content = "id,input,output\ncase-1,hello,world\ncase-2,foo,bar";
    const filePath = await writeTmpFile("valid.csv", content);
    const cases = await loadCases(filePath);
    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({ id: "case-1", input: "hello", output: "world" });
    expect(cases[1]).toMatchObject({ id: "case-2", input: "foo", output: "bar" });
  });

  it("maps extra CSV columns to metadata", async () => {
    const content = "id,input,output,category\ncase-1,hello,world,tone";
    const filePath = await writeTmpFile("extra-cols.csv", content);
    const cases = await loadCases(filePath);
    expect(cases[0]?.metadata).toEqual({ category: "tone" });
  });

  it("throws with a clear error when required header columns are missing", async () => {
    const content = "name,input,output\ncase-1,hello,world";
    const filePath = await writeTmpFile("missing-header.csv", content);
    await expect(loadCases(filePath)).rejects.toThrow(/CSV header must contain/);
  });

  it("throws with line number on validation failure", async () => {
    const content = "id,input,output\n,hello,world";
    const filePath = await writeTmpFile("invalid-id.csv", content);
    await expect(loadCases(filePath)).rejects.toThrow(/line 2/);
  });

  it("overrides format via options.format", async () => {
    const content = "id,input,output\ncase-1,hello,world";
    // Write without .csv extension
    const filePath = await writeTmpFile("noext.txt", content);
    const cases = await loadCases(filePath, { format: "csv" });
    expect(cases).toHaveLength(1);
  });

  it("uses custom delimiter via options.delimiter", async () => {
    const content = "id\tinput\toutput\ncase-1\thello\tworld";
    const filePath = await writeTmpFile("tab.tsv", content);
    const cases = await loadCases(filePath, { format: "csv", delimiter: "\t" });
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ id: "case-1", input: "hello", output: "world" });
  });
});
