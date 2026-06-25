import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Report, Reporter } from '../types.js';

/**
 * Creates a reporter that writes the full Report as formatted JSON to a file.
 * Auto-creates parent directories if they don't exist.
 *
 * @param filePath - Absolute or relative path to the output JSON file.
 * @returns An async Reporter function.
 */
export function jsonReporter(filePath: string): Reporter {
  return async (report: Report): Promise<void> => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const json = JSON.stringify(report, null, 2);
    fs.writeFileSync(filePath, json, 'utf-8');
  };
}
