import * as fs from "node:fs";
import * as path from "node:path";

/**
 * CLI configuration for evalkit.
 */
export interface CliConfig {
  /** Glob patterns or file paths for suite files. */
  suites: string[];
  /** Default reporter. Default: 'console'. */
  reporter?: "console" | "json" | undefined;
  /** Verbose console output. Default: false. */
  verbose?: boolean | undefined;
  /** Minimum pass rate (0..1). No default — unchecked unless set. */
  threshold?: number | undefined;
  /** JSON output file path. No default — stdout unless set. */
  output?: string | undefined;
  /** Fail on scorer errors. Default: false. */
  failOnError?: boolean | undefined;
}

/**
 * Resolved CLI configuration with all defaults applied.
 */
export interface ResolvedConfig {
  suites: string[];
  reporter: "console" | "json";
  verbose: boolean;
  threshold: number | undefined;
  output: string | undefined;
  failOnError: boolean;
}

/**
 * Type-safe config helper. Returns the config object unchanged.
 * Provides autocomplete when writing evalkit.config.ts.
 */
export function defineConfig(config: CliConfig): CliConfig {
  return config;
}

interface ResolveOptions {
  cwd: string;
  configPath?: string | undefined;
  flags?:
    | Partial<Pick<ResolvedConfig, "reporter" | "verbose" | "threshold" | "output" | "failOnError">>
    | undefined;
}

const CONFIG_FILENAMES = ["evalkit.config.ts", "evalkit.config.js"];

function findConfigFile(cwd: string): string | undefined {
  for (const name of CONFIG_FILENAMES) {
    const fullPath = path.resolve(cwd, name);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return undefined;
}

/**
 * Resolves CLI configuration from config file + CLI flags.
 * CLI flags take precedence over config file values.
 */
export function resolveConfig(options: ResolveOptions): ResolvedConfig {
  const { cwd, configPath, flags = {} } = options;

  const fileConfig: Partial<CliConfig> = {};

  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    // Config file loading handled by jiti at runtime — for now use defaults
    // The run command will load the config file via jiti
  } else {
    const found = findConfigFile(cwd);
    if (found) {
      // Will be loaded by jiti at runtime
      void found;
    }
  }

  // Validate flags
  const reporter = flags.reporter ?? fileConfig.reporter ?? "console";
  if (reporter !== "console" && reporter !== "json") {
    throw new Error(`Unknown reporter "${reporter}". Available: console, json`);
  }

  const threshold = flags.threshold ?? fileConfig.threshold;
  if (threshold !== undefined && (threshold < 0 || threshold > 1)) {
    throw new Error(`Threshold must be a number between 0 and 1. Got: ${threshold}`);
  }

  return {
    suites: fileConfig.suites ?? [],
    reporter,
    verbose: flags.verbose ?? fileConfig.verbose ?? false,
    threshold,
    output: flags.output ?? fileConfig.output,
    failOnError: flags.failOnError ?? fileConfig.failOnError ?? false,
  };
}
