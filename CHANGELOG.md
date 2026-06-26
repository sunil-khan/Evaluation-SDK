# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
