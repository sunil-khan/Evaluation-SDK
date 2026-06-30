/**
 * Parsers for JSONL (one JSON object per line) and JSON (top-level array) formats.
 */

/**
 * Parse JSONL content into an array of unknown values.
 *
 * Empty lines are skipped. Parse errors include the 1-based line number.
 *
 * @param content  Raw JSONL string.
 * @returns        Array of parsed values — one per non-empty line.
 */
export function parseJSONL(content: string): unknown[] {
  const lines = content.split("\n");
  const results: unknown[] = [];
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;
    if (line.trim() === "") continue;

    try {
      results.push(JSON.parse(line));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`JSONL parse error at line ${lineNumber}: invalid JSON — ${message}`);
    }
  }

  return results;
}

/**
 * Parse a JSON file whose top-level value is an array.
 *
 * @param content  Raw JSON string.
 * @returns        The parsed array.
 * @throws         If the content is not valid JSON or not a top-level array.
 */
export function parseJSON(content: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`JSON parse error: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`JSON parse error: expected a top-level array, got ${typeof parsed}`);
  }

  return parsed;
}
