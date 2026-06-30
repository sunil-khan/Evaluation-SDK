/**
 * Hand-rolled CSV parser with support for:
 * - Quoted fields (commas inside quotes)
 * - Double-quote escaping (`""` → `"`)
 * - Custom delimiter
 * - CRLF and LF line endings
 * - Empty line skipping
 */

interface ParseState {
  current: string;
  inQuotes: boolean;
  i: number;
}

/** Advance one step while inside a quoted field. Returns updated index. */
function stepInQuotes(line: string, state: ParseState): void {
  const ch = line[state.i];
  if (ch === '"') {
    if (line[state.i + 1] === '"') {
      // Doubled quote → literal quote character
      state.current += '"';
      state.i += 2;
    } else {
      // Closing quote
      state.inQuotes = false;
      state.i++;
    }
  } else {
    state.current += ch;
    state.i++;
  }
}

/** Advance one step while outside a quoted field. Returns whether a delimiter was consumed. */
function stepOutsideQuotes(
  line: string,
  delimiter: string,
  fields: string[],
  state: ParseState,
): void {
  const ch = line[state.i];
  if (ch === '"') {
    state.inQuotes = true;
    state.i++;
  } else if (line.startsWith(delimiter, state.i)) {
    fields.push(state.current);
    state.current = "";
    state.i += delimiter.length;
  } else {
    state.current += ch;
    state.i++;
  }
}

/** Parse a single CSV line into an array of field values. */
function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  const state: ParseState = { current: "", inQuotes: false, i: 0 };

  while (state.i < line.length) {
    if (state.inQuotes) {
      stepInQuotes(line, state);
    } else {
      stepOutsideQuotes(line, delimiter, fields, state);
    }
  }

  fields.push(state.current);
  return fields;
}

/**
 * Parse CSV content into an array of records.
 *
 * The first row is treated as the header.
 * Empty lines are skipped.
 * CRLF line endings are normalised to LF before parsing.
 *
 * @param content   Raw CSV string.
 * @param delimiter Field separator. Default: `','`.
 * @returns         Array of `Record<string, string>` — one per data row.
 */
export function parseCSV(content: string, delimiter = ","): Record<string, string>[] {
  // Normalise Windows line endings
  const normalised = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalised.split("\n");

  // Find the header line (first non-empty line)
  let headerIndex = -1;
  let headers: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && line.trim() !== "") {
      headerIndex = i;
      headers = parseLine(line, delimiter);
      break;
    }
  }

  if (headerIndex === -1) {
    return [];
  }

  const rows: Record<string, string>[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === "") continue;

    const fields = parseLine(line, delimiter);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      if (header !== undefined) {
        row[header] = fields[j] ?? "";
      }
    }
    rows.push(row);
  }

  return rows;
}
