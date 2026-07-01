import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { resolveConfig } from "./config.js";
import { loadSuiteFile, resolveSuiteFiles } from "./loader.js";
import { printSummary, runCommand } from "./run.js";

interface ParsedArgs {
  command: "run" | "help" | "version";
  files: string[];
  flags: {
    config?: string | undefined;
    reporter?: string | undefined;
    verbose?: boolean | undefined;
    threshold?: number | undefined;
    output?: string | undefined;
    failOnError?: boolean | undefined;
    baseline?: string | undefined;
    regressionTolerance?: number | undefined;
  };
}

export function parseCliArgs(args: string[]): ParsedArgs {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { command: "help", files: [], flags: {} };
  }

  if (args.includes("--version")) {
    return { command: "version", files: [], flags: {} };
  }

  const command = args[0];
  if (command !== "run") {
    return { command: "help", files: [], flags: {} };
  }

  const runArgs = args.slice(1);

  const { values, positionals } = parseArgs({
    args: runArgs,
    options: {
      config: { type: "string", short: "c" },
      reporter: { type: "string", short: "r" },
      verbose: { type: "boolean", short: "v", default: false },
      threshold: { type: "string", short: "t" },
      output: { type: "string", short: "o" },
      "fail-on-error": { type: "boolean", default: false },
      baseline: { type: "string", short: "b" },
      "regression-tolerance": { type: "string" },
    },
    allowPositionals: true,
  });

  return {
    command: "run",
    files: positionals,
    flags: {
      config: values.config,
      reporter: values.reporter,
      verbose: values.verbose,
      threshold: values.threshold ? Number(values.threshold) : undefined,
      output: values.output,
      failOnError: values["fail-on-error"],
      baseline: values.baseline,
      regressionTolerance: values["regression-tolerance"]
        ? Number(values["regression-tolerance"])
        : undefined,
    },
  };
}

function printHelp(): void {
  const help = `
Usage: evalkit <command> [options]

Commands:
  run [files...]    Run evaluation suite files

Options:
  -c, --config <path>      Config file path (default: evalkit.config.ts)
  -r, --reporter <type>    Reporter: console, json (default: console)
  -v, --verbose            Verbose console output
  -t, --threshold <n>      Minimum pass rate 0..1, exit 1 if below
  -o, --output <path>      JSON output file path
      --fail-on-error      Exit 1 on scorer errors
  -h, --help               Show this help
      --version            Show version

Examples:
  evalkit run ./suites/support-bot.ts
  evalkit run "./suites/**/*.ts" --threshold 0.8
  evalkit run --config evalkit.config.ts --reporter json
`;
  process.stdout.write(help.trim() + "\n");
}

function printVersion(): void {
  const pkgPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "package.json",
  );
  let version = "unknown";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    version = pkg.version ?? "unknown";
  } catch {
    // Try alternative path (when running from dist/)
    try {
      const altPath = path.resolve(
        path.dirname(new URL(import.meta.url).pathname),
        "..",
        "..",
        "package.json",
      );
      const pkg = JSON.parse(fs.readFileSync(altPath, "utf-8")) as { version?: string };
      version = pkg.version ?? "unknown";
    } catch {
      // Fallback to unknown
    }
  }
  process.stdout.write(`evalkit v${version}\n`);
}

function buildResolveFlags(
  flags: ParsedArgs["flags"],
): Parameters<typeof resolveConfig>[0]["flags"] {
  const out: Parameters<typeof resolveConfig>[0]["flags"] = {};
  if (flags.reporter !== undefined) out.reporter = flags.reporter as "console" | "json";
  if (flags.verbose !== undefined) out.verbose = flags.verbose;
  if (flags.threshold !== undefined) out.threshold = flags.threshold;
  if (flags.output !== undefined) out.output = flags.output;
  if (flags.failOnError !== undefined) out.failOnError = flags.failOnError;
  if (flags.baseline !== undefined) out.baseline = flags.baseline;
  if (flags.regressionTolerance !== undefined) out.regressionTolerance = flags.regressionTolerance;
  return out;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseCliArgs(argv);

  if (parsed.command === "help") {
    printHelp();
    process.exitCode = 0;
    return;
  }

  if (parsed.command === "version") {
    printVersion();
    process.exitCode = 0;
    return;
  }

  // Run command
  try {
    const config = resolveConfig({
      cwd: process.cwd(),
      configPath: parsed.flags.config,
      flags: buildResolveFlags(parsed.flags),
    });

    // Resolve files from args or config
    const patterns = parsed.files.length > 0 ? parsed.files : config.suites;

    if (patterns.length === 0) {
      process.stderr.write(
        "Error: No suite files specified. Provide file paths or use --config.\n",
      );
      process.exitCode = 3;
      return;
    }

    const filePaths = resolveSuiteFiles(patterns);

    // Load all suites
    const allSuites: Array<{ run(): Promise<unknown> }> = [];
    for (const filePath of filePaths) {
      const suites = await loadSuiteFile(filePath);
      allSuites.push(...suites);
    }

    if (allSuites.length === 0) {
      process.stderr.write("Error: No suites found in the specified files.\n");
      process.exitCode = 3;
      return;
    }

    const exitCode = await runCommand({
      suites: allSuites as Array<{ run(): Promise<import("../types.js").Report> }>,
      config,
    });

    // Print aggregate summary for multi-suite console runs
    if (allSuites.length > 1 && config.reporter === "console") {
      // Individual suite summaries already printed by consoleReporter
      // printSummary provides an optional aggregate view
    }

    process.exitCode = exitCode;
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 3;
  }
}

// Auto-run when executed directly
main();
