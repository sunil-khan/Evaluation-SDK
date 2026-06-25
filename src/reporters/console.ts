import type { Report, Reporter } from '../types.js';

interface ConsoleReporterOptions {
  /** Show metadata and raw scorer detail for each case. Default: false. */
  readonly verbose?: boolean;
}

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Creates a reporter that outputs a formatted table to stdout.
 * Shows pass/fail status, scores, and reasons for failed cases.
 *
 * @param options - Display options.
 * @returns A Reporter function.
 */
export function consoleReporter(options: ConsoleReporterOptions = {}): Reporter {
  return (report: Report): void => {
    const lines: string[] = [];

    lines.push('');
    lines.push(`${BOLD}Suite: ${report.suite}${RESET}`);
    lines.push(`${DIM}${report.startedAt} → ${report.finishedAt}${RESET}`);
    lines.push('');

    // Header
    const scorerNames = Object.keys(report.summary.byScorer);
    const headerCols = ['Case', ...scorerNames, 'Status'];
    lines.push(headerCols.map((c) => c.padEnd(16)).join('│ '));
    lines.push('─'.repeat(headerCols.length * 18));

    // Rows
    for (const caseReport of report.cases) {
      const cols: string[] = [caseReport.testCase.id.padEnd(16)];

      for (const name of scorerNames) {
        const result = caseReport.results.find((r) => r.scorer === name);
        if (result) {
          const color = result.passed ? GREEN : RED;
          const icon = result.passed ? '\u2713' : '\u2717';
          cols.push(`${color}${result.score.toFixed(2)} ${icon}${RESET}`.padEnd(25));
        } else {
          cols.push(`${DIM}---${RESET}`.padEnd(25));
        }
      }

      const statusColor = caseReport.passed ? GREEN : RED;
      const statusText = caseReport.passed ? 'PASS' : 'FAIL';
      cols.push(`${statusColor}${BOLD}${statusText}${RESET}`);

      lines.push(cols.join('│ '));
    }

    lines.push('');

    // Summary
    const { summary } = report;
    const passColor = summary.passRate >= 0.8 ? GREEN : summary.passRate >= 0.5 ? YELLOW : RED;
    lines.push(
      `${BOLD}Summary:${RESET} ${passColor}${summary.passed}/${summary.total} passed (${(summary.passRate * 100).toFixed(1)}%)${RESET} │ Avg latency: ${summary.avgLatencyMs.toFixed(1)}ms`
    );

    if (summary.errored > 0) {
      lines.push(`${YELLOW}  ${summary.errored} case(s) had scorer errors${RESET}`);
    }

    // Per-scorer stats
    for (const [name, stats] of Object.entries(summary.byScorer)) {
      lines.push(
        `  ${DIM}${name}: ${(stats.passRate * 100).toFixed(1)}% pass, avg ${stats.avgScore.toFixed(2)}${RESET}`
      );
    }

    // Failed cases detail
    const failedCases = report.cases.filter((c) => !c.passed);
    if (failedCases.length > 0) {
      lines.push('');
      lines.push(`${RED}${BOLD}Failed cases:${RESET}`);
      for (const fc of failedCases) {
        const failedResults = fc.results.filter((r) => !r.passed);
        for (const r of failedResults) {
          lines.push(`  ${fc.testCase.id} → ${r.scorer}: ${DIM}${r.reason ?? 'no reason'}${RESET}`);
        }
      }
    }

    // Verbose detail
    if (options.verbose) {
      lines.push('');
      lines.push(`${BOLD}Detailed Results:${RESET}`);
      for (const caseReport of report.cases) {
        lines.push(`  ${BOLD}${caseReport.testCase.id}${RESET}`);
        for (const r of caseReport.results) {
          lines.push(
            `    ${r.scorer}: score=${r.score.toFixed(2)} passed=${r.passed} reason="${r.reason ?? ''}" latency=${r.latencyMs.toFixed(1)}ms`
          );
        }
        if (caseReport.testCase.metadata) {
          lines.push(`    ${DIM}metadata: ${JSON.stringify(caseReport.testCase.metadata)}${RESET}`);
        }
      }
    }

    lines.push('');
    process.stdout.write(lines.join('\n'));
  };
}
