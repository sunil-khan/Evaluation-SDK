# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-07-01

### Added
- Regression mode: `compareReports()` for detecting quality regressions.
- CLI `--baseline` flag for regression checks against saved Report JSON.
- CLI `--regression-tolerance` flag for allowing small fluctuations.
- Flipped case detection (pass → fail), per-scorer average tracking.
- Colored regression summary output.

## [0.3.0] - 2026-06-30

### Added
- Dataset loader: `loadCases()` for CSV, JSONL, and JSON files.
- Auto-format detection by file extension.
- Extra columns/fields mapped to `metadata`.
- Clear error messages with line numbers.

## [0.2.0] - 2026-06-28

### Added
- CLI: `evalkit run` command for running suite files from the terminal.
- Config file support (`evalkit.config.ts`) with `defineConfig` helper.
- `--reporter`, `--threshold`, `--output`, `--verbose`, `--fail-on-error` flags.
- Exit codes for CI integration (0/1/2/3).
- Glob pattern support for suite file discovery.
- TypeScript file loading via jiti (no tsx dependency required).

## [0.1.0] - 2026-06-25

### Added
- Core type model: `TestCase`, `Scorer`, `ScoreResult`, `Report`.
- Four scorers: `exactMatch`, `semanticSimilarity`, `llmJudge`, `composite`.
- Bounded-concurrency runner with per-scorer error isolation.
- `consoleReporter` and `jsonReporter`.
- Typed error hierarchy: `ConfigError`, `AdapterError`, `JudgeParseError`, `ScorerError`.
- Provider-agnostic adapter interfaces: `ChatAdapter`, `EmbeddingAdapter`.
- Example adapters for OpenAI and Anthropic.
- Five runnable examples including RAG pipeline evaluation.
- CI pipeline: lint (biome) + typecheck (tsc) + test (vitest).
- Dual ESM/CJS build via tsup.
