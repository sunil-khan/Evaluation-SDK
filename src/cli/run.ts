import { consoleReporter } from "../reporters/console.js";
import { jsonReporter } from "../reporters/json.js";
import type { Report } from "../types.js";
import type { ResolvedConfig } from "./config.js";

interface Suite {
  run(): Promise<Report>;
}

interface RunOptions {
  suites: Suite[];
  config: ResolvedConfig;
}

/**
 * Executes all suites, applies reporters, and returns an exit code.
 *
 * Exit codes:
 *   0 — all passed (and above threshold if set)
 *   1 — any suite failed or below threshold
 *   2 — scorer errors occurred (only if failOnError)
 */
export async function runCommand(options: RunOptions): Promise<number> {
  const { suites, config } = options;
  const reports: Report[] = [];
  let hasFailures = false;
  let hasErrors = false;
  let belowThreshold = false;

  for (const suite of suites) {
    const report = await suite.run();
    reports.push(report);

    // Apply reporter
    if (config.reporter === "console") {
      const reporter = consoleReporter({ verbose: config.verbose });
      reporter(report);
    }

    // Check results
    if (report.summary.failed > 0) {
      hasFailures = true;
    }

    if (report.summary.errored > 0) {
      hasErrors = true;
    }

    if (config.threshold !== undefined && report.summary.passRate < config.threshold) {
      belowThreshold = true;
    }
  }

  // Write JSON output if requested
  if (config.output) {
    const outputReport: Report =
      reports.length === 1
        ? reports[0]!
        : {
            suite: "aggregate",
            startedAt: reports[0]?.startedAt ?? new Date().toISOString(),
            finishedAt: reports[reports.length - 1]?.finishedAt ?? new Date().toISOString(),
            cases: reports.flatMap((r) => [...r.cases]),
            summary: {
              total: reports.reduce((s, r) => s + r.summary.total, 0),
              passed: reports.reduce((s, r) => s + r.summary.passed, 0),
              failed: reports.reduce((s, r) => s + r.summary.failed, 0),
              errored: reports.reduce((s, r) => s + r.summary.errored, 0),
              passRate:
                reports.reduce((s, r) => s + r.summary.total, 0) > 0
                  ? reports.reduce((s, r) => s + r.summary.passed, 0) /
                    reports.reduce((s, r) => s + r.summary.total, 0)
                  : 0,
              byScorer: {},
              avgLatencyMs:
                reports.reduce((s, r) => s + r.summary.avgLatencyMs, 0) /
                Math.max(reports.length, 1),
            },
          };

    await jsonReporter(config.output)(outputReport);
  }

  // Determine exit code — failures take precedence
  if (hasFailures || belowThreshold) {
    return 1;
  }

  if (hasErrors && config.failOnError) {
    return 2;
  }

  return 0;
}

/**
 * Prints a summary line for multi-suite runs.
 */
export function printSummary(
  reports: Report[],
  threshold: number | undefined
): void {
  const totalCases = reports.reduce((s, r) => s + r.summary.total, 0);
  const totalPassed = reports.reduce((s, r) => s + r.summary.passed, 0);
  const overallRate = totalCases > 0 ? totalPassed / totalCases : 0;

  const lines: string[] = [];
  lines.push("");
  lines.push("━".repeat(48));
  lines.push(
    `Total: ${reports.length} suite${reports.length === 1 ? "" : "s"}, ${totalPassed}/${totalCases} passed (${(overallRate * 100).toFixed(1)}%)`
  );

  if (threshold !== undefined) {
    const belowSuites = reports.filter((r) => r.summary.passRate < threshold);
    if (belowSuites.length > 0) {
      const names = belowSuites
        .map((r) => `${r.suite} at ${(r.summary.passRate * 100).toFixed(1)}%`)
        .join(", ");
      lines.push(
        `Threshold: ${(threshold * 100).toFixed(0)}% — \x1b[31mFAILED\x1b[0m (${names})`
      );
    } else {
      lines.push(
        `Threshold: ${(threshold * 100).toFixed(0)}% — \x1b[32mPASSED\x1b[0m`
      );
    }
  }

  lines.push("");
  process.stdout.write(lines.join("\n"));
}
