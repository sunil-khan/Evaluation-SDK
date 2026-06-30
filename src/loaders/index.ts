import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { TestCase } from "../types.js";
import { testCaseSchema } from "../types.js";
import { parseCSV } from "./csv.js";
import { parseJSON, parseJSONL } from "./jsonl.js";

/** Options for `loadCases`. */
export interface LoadOptions {
  /** Override format auto-detection. */
  format?: "csv" | "jsonl" | "json" | undefined;
  /** CSV field delimiter. Default: `','`. */
  delimiter?: string | undefined;
}

/** Columns that map directly to TestCase fields — everything else goes to metadata. */
const KNOWN_FIELDS = new Set(["id", "input", "output", "expected", "metadata"]);

/**
 * Extract extra fields from a raw record and return them as a metadata object.
 * If there are no extra fields the metadata is omitted.
 */
function extractMetadata(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN_FIELDS.has(key)) {
      extra[key] = value;
    }
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

/**
 * Build a TestCase from a raw object (from CSV or JSON/JSONL).
 * Validates required fields and attaches extra fields as `metadata`.
 * Throws with a line number on validation failure.
 */
function buildTestCase(raw: unknown, lineNumber: number): TestCase {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Validation error at line ${lineNumber}: expected an object`);
  }

  const record = raw as Record<string, unknown>;
  const metadata = extractMetadata(record);

  // Build candidate with known fields only
  const candidate: Record<string, unknown> = {};
  for (const field of KNOWN_FIELDS) {
    if (field in record) {
      candidate[field] = record[field];
    }
  }
  if (metadata !== undefined) {
    candidate.metadata = metadata;
  }

  const result = testCaseSchema.safeParse(candidate);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Validation failed";
    throw new Error(`Validation error at line ${lineNumber}: ${message}`);
  }

  return result.data as TestCase;
}

/** Validate that the CSV header row contains the required columns. */
function validateCSVHeaders(headers: string[]): void {
  const required = ["id", "input", "output"];
  const missing = required.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    throw new Error(
      `CSV header must contain "id", "input", and "output" columns` +
        ` (missing: ${missing.map((c) => `"${c}"`).join(", ")})`,
    );
  }
}

/** Load and parse a CSV file, returning validated TestCase[]. */
async function loadCSV(content: string, delimiter: string): Promise<TestCase[]> {
  const rows = parseCSV(content, delimiter);

  if (rows.length === 0) {
    return [];
  }

  // Validate headers using the keys of the first row
  validateCSVHeaders(Object.keys(rows[0] ?? {}));

  return rows.map((row, index) => buildTestCase(row, index + 2)); // +2: header is line 1
}

/** Load and parse a JSONL file, returning validated TestCase[]. */
async function loadJSONL(content: string): Promise<TestCase[]> {
  const items = parseJSONL(content); // throws with line numbers already

  return items.map((item, index) => buildTestCase(item, index + 1));
}

/** Load and parse a JSON array file, returning validated TestCase[]. */
async function loadJSONArray(content: string): Promise<TestCase[]> {
  const items = parseJSON(content);

  return items.map((item, index) => buildTestCase(item, index + 1));
}

/**
 * Load test cases from a CSV, JSONL, or JSON file.
 *
 * Format is auto-detected from the file extension unless overridden via
 * `options.format`. Each row/object is validated against `testCaseSchema`.
 * Extra columns or fields are placed in `metadata`.
 *
 * @param filePath  Absolute or relative path to the data file.
 * @param options   Optional overrides for format and CSV delimiter.
 * @returns         `TestCase[]` ready for use with `defineSuite`.
 */
export async function loadCases(filePath: string, options: LoadOptions = {}): Promise<TestCase[]> {
  // Read file — surface a clear "not found" error
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  // Determine format
  const ext = extname(filePath).toLowerCase();
  const format =
    options.format ??
    (ext === ".csv" ? "csv" : ext === ".jsonl" ? "jsonl" : ext === ".json" ? "json" : undefined);

  if (format === undefined) {
    throw new Error(`Unsupported file format "${ext}". Supported: .csv, .jsonl, .json`);
  }

  const delimiter = options.delimiter ?? ",";

  switch (format) {
    case "csv":
      return loadCSV(content, delimiter);
    case "jsonl":
      return loadJSONL(content);
    case "json":
      return loadJSONArray(content);
  }
}
