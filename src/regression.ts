import type { Report } from "./types.js";

/**
 * Options for comparing two reports.
 */
export interface CompareOptions {
  /**
   * Maximum allowed pass rate drop before flagging a regression.
   * Range [0, 1]. Default: 0 (any drop is a regression).
   */
  tolerance?: number | undefined;
}

/**
 * The result of comparing a current report against a baseline.
 */
export interface RegressionResult {
  /** Whether a regression was detected. */
  regressed: boolean;
  /** Human-readable summary of changes. */
  summary: string;
  /** Pass rate change. */
  passRate: {
    baseline: number;
    current: number;
    delta: number;
    regressed: boolean;
  };
  /** Cases that flipped from pass to fail. */
  flippedCases: Array<{
    caseId: string;
    baselineScores: Record<string, number>;
    currentScores: Record<string, number>;
  }>;
  /** Per-scorer average changes. */
  scorerChanges: Record<
    string,
    {
      baseline: number;
      current: number;
      delta: number;
      regressed: boolean;
    }
  >;
  /** Cases that were newly added (not in baseline). */
  newCases: string[];
  /** Cases that were removed (in baseline but not current). */
  removedCases: string[];
}

/**
 * Compare a current evaluation report against a baseline report to detect regressions.
 *
 * A regression is detected if ANY of:
 * 1. Pass rate dropped by more than `tolerance` (default 0 — any drop)
 * 2. Any case flipped from pass → fail
 * 3. Any scorer's average score dropped by more than `tolerance`
 */
export function compareReports(
  current: Report,
  baseline: Report,
  options: CompareOptions = {},
): RegressionResult {
  const tolerance = options.tolerance ?? 0;

  // ── Pass rate ──────────────────────────────────────────────────────────────
  const baselinePassRate = baseline.summary.passRate;
  const currentPassRate = current.summary.passRate;
  const passRateDelta = currentPassRate - baselinePassRate;
  const passRateRegressed = passRateDelta < -tolerance;

  // ── Index cases by id ──────────────────────────────────────────────────────
  const baselineCaseMap = new Map(baseline.cases.map((c) => [c.testCase.id, c]));
  const currentCaseMap = new Map(current.cases.map((c) => [c.testCase.id, c]));

  // ── New / removed cases ────────────────────────────────────────────────────
  const newCases: string[] = [];
  for (const id of currentCaseMap.keys()) {
    if (!baselineCaseMap.has(id)) {
      newCases.push(id);
    }
  }

  const removedCases: string[] = [];
  for (const id of baselineCaseMap.keys()) {
    if (!currentCaseMap.has(id)) {
      removedCases.push(id);
    }
  }

  // ── Flipped cases (pass → fail) ────────────────────────────────────────────
  const flippedCases: RegressionResult["flippedCases"] = [];
  for (const [id, baselineCase] of baselineCaseMap) {
    const currentCase = currentCaseMap.get(id);
    if (!currentCase) continue;
    if (baselineCase.passed && !currentCase.passed) {
      const baselineScores: Record<string, number> = {};
      for (const r of baselineCase.results) {
        baselineScores[r.scorer] = r.score;
      }
      const currentScores: Record<string, number> = {};
      for (const r of currentCase.results) {
        currentScores[r.scorer] = r.score;
      }
      flippedCases.push({ caseId: id, baselineScores, currentScores });
    }
  }

  // ── Scorer average changes ─────────────────────────────────────────────────
  // Compute per-scorer averages from raw case data (more accurate than summary.byScorer)
  const baselineScorerTotals = new Map<string, { sum: number; count: number }>();
  for (const c of baseline.cases) {
    for (const r of c.results) {
      const existing = baselineScorerTotals.get(r.scorer) ?? { sum: 0, count: 0 };
      baselineScorerTotals.set(r.scorer, { sum: existing.sum + r.score, count: existing.count + 1 });
    }
  }

  const currentScorerTotals = new Map<string, { sum: number; count: number }>();
  for (const c of current.cases) {
    for (const r of c.results) {
      const existing = currentScorerTotals.get(r.scorer) ?? { sum: 0, count: 0 };
      currentScorerTotals.set(r.scorer, { sum: existing.sum + r.score, count: existing.count + 1 });
    }
  }

  const scorerChanges: RegressionResult["scorerChanges"] = {};
  // All scorers seen in either report
  const allScorers = new Set([...baselineScorerTotals.keys(), ...currentScorerTotals.keys()]);
  let anyScorerRegressed = false;

  for (const scorer of allScorers) {
    const baselineTotals = baselineScorerTotals.get(scorer);
    const currentTotals = currentScorerTotals.get(scorer);

    if (!baselineTotals || !currentTotals) continue; // scorer only in one report — skip

    const baselineAvg = baselineTotals.sum / baselineTotals.count;
    const currentAvg = currentTotals.sum / currentTotals.count;
    const delta = currentAvg - baselineAvg;
    const regressed = delta < -tolerance;

    if (regressed) anyScorerRegressed = true;

    scorerChanges[scorer] = {
      baseline: baselineAvg,
      current: currentAvg,
      delta,
      regressed,
    };
  }

  // ── Overall regression ─────────────────────────────────────────────────────
  const regressed = passRateRegressed || flippedCases.length > 0 || anyScorerRegressed;

  const result: RegressionResult = {
    regressed,
    summary: "", // filled in below
    passRate: {
      baseline: baselinePassRate,
      current: currentPassRate,
      delta: passRateDelta,
      regressed: passRateRegressed,
    },
    flippedCases,
    scorerChanges,
    newCases,
    removedCases,
  };

  result.summary = formatRegressionSummary(result);

  return result;
}

/**
 * Format a RegressionResult into a human-readable string with colored output.
 */
export function formatRegressionSummary(result: RegressionResult): string {
  const lines: string[] = [];
  const RESET = "\x1b[0m";
  const GREEN = "\x1b[32m";
  const RED = "\x1b[31m";
  const YELLOW = "\x1b[33m";

  lines.push("━━━ Regression Report ━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Pass rate line
  const pr = result.passRate;
  const prPct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const prArrow = pr.delta > 0 ? `${GREEN}▲${RESET}` : pr.delta < 0 ? `${RED}▼${RESET}` : "▶";
  const prDeltaStr = `${prArrow} ${Math.abs(pr.delta * 100).toFixed(1)}%`;
  const prStatus = pr.regressed ? `${RED}REGRESSED${RESET}` : `${GREEN}OK${RESET}`;
  lines.push(`Pass rate: ${prPct(pr.baseline)} → ${prPct(pr.current)} (${prDeltaStr}) — ${prStatus}`);

  // Flipped cases
  if (result.flippedCases.length > 0) {
    lines.push("");
    lines.push("Cases that flipped PASS → FAIL:");
    for (const fc of result.flippedCases) {
      const scoreDetails = Object.entries(fc.baselineScores)
        .map(([scorer, baseScore]) => {
          const curScore = fc.currentScores[scorer] ?? 0;
          return `${scorer} ${baseScore.toFixed(2)} → ${curScore.toFixed(2)}`;
        })
        .join(", ");
      lines.push(`  ${fc.caseId}: ${scoreDetails}`);
    }
  }

  // Scorer changes
  const scorerEntries = Object.entries(result.scorerChanges);
  if (scorerEntries.length > 0) {
    lines.push("");
    lines.push("Scorer changes:");
    for (const [name, change] of scorerEntries) {
      const arrow = change.delta > 0 ? `${GREEN}▲${RESET}` : change.delta < 0 ? `${RED}▼${RESET}` : "▶";
      const deltaStr = `${arrow} ${Math.abs(change.delta).toFixed(2)}`;
      const status = change.regressed ? `${RED}REGRESSED${RESET}` : `${GREEN}OK${RESET}`;
      lines.push(
        `  ${name}: avg ${change.baseline.toFixed(2)} → ${change.current.toFixed(2)} (${deltaStr}) — ${status}`,
      );
    }
  }

  // New / removed cases
  lines.push("");
  const newLabel =
    result.newCases.length > 0
      ? `${result.newCases.length} (${result.newCases.join(", ")})`
      : "0";
  lines.push(`New cases: ${newLabel}`);

  if (result.removedCases.length > 0) {
    lines.push(
      `${YELLOW}Removed cases: ${result.removedCases.length} (${result.removedCases.join(", ")})${RESET}`,
    );
  } else {
    lines.push("Removed cases: 0");
  }

  if (!result.regressed) {
    lines.push("");
    lines.push(`${GREEN}No regressions detected.${RESET}`);
  }

  return lines.join("\n");
}
