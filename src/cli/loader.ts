import * as fs from "node:fs";
import * as path from "node:path";

interface Suite {
  run(): Promise<unknown>;
}

function isSuite(value: unknown): value is Suite {
  return (
    typeof value === "object" &&
    value !== null &&
    "run" in value &&
    typeof (value as Suite).run === "function"
  );
}

/**
 * Loads a suite file and returns an array of Suites.
 * Uses jiti for TypeScript transpilation.
 */
export async function loadSuiteFile(filePath: string): Promise<Suite[]> {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
  });

  let mod: unknown;
  try {
    mod = await jiti.import(resolved);
  } catch (err) {
    throw new Error(
      `Failed to load suite file: ${filePath}\n${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Handle interop — jiti may wrap in { default: ... }
  const exported =
    typeof mod === "object" && mod !== null && "default" in mod
      ? (mod as Record<string, unknown>).default
      : mod;

  if (Array.isArray(exported)) {
    if (exported.length === 0 || !exported.every(isSuite)) {
      throw new Error(
        `Suite file must export a Suite or Suite[] as default export.\n  Got: empty array or non-Suite elements\n  File: ${filePath}`
      );
    }
    return exported;
  }

  if (isSuite(exported)) {
    return [exported];
  }

  throw new Error(
    `Suite file must export a Suite or Suite[] as default export.\n  Got: ${typeof exported}\n  File: ${filePath}`
  );
}

/**
 * Resolves file paths from patterns (direct paths or globs).
 * Returns absolute paths to existing files.
 */
export function resolveSuiteFiles(patterns: string[]): string[] {
  const files: Set<string> = new Set();

  for (const pattern of patterns) {
    // Check if it's a direct file path
    const resolved = path.resolve(pattern);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      files.add(resolved);
      continue;
    }

    // Try glob (Node 22+ fs.globSync)
    try {
      const dir = path.dirname(pattern);
      const globPattern = path.basename(pattern);
      const resolvedDir = path.resolve(dir);

      if (!fs.existsSync(resolvedDir)) {
        continue;
      }

      const ext = path.extname(globPattern);
      const entries = fs.readdirSync(resolvedDir);
      const matchingFiles = entries
        .filter((entry) => {
          if (ext) {
            return entry.endsWith(ext);
          }
          return entry.endsWith(".ts") || entry.endsWith(".js");
        })
        .map((entry) => path.join(resolvedDir, entry));

      for (const file of matchingFiles) {
        files.add(file);
      }
    } catch {
      // Not a valid glob, skip
    }
  }

  const result = [...files].sort();

  if (result.length === 0) {
    throw new Error(
      `No suite files found matching patterns: ${patterns.join(", ")}`
    );
  }

  return result;
}
