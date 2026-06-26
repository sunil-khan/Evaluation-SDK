import { z } from "zod";
import { AdapterError, JudgeParseError } from "../errors.js";
import type { ChatAdapter, ScoreResult, Scorer, TestCase } from "../types.js";

interface LlmJudgeOptions {
  /** The chat adapter to use for judge calls. */
  readonly model: ChatAdapter;
  /** What "good" means, in plain language. */
  readonly rubric: string;
  /** The scoring scale. Default: { min: 1, max: 5 }. */
  readonly scale?: { min: number; max: number };
  /** Normalized pass threshold. Default: 0.6. */
  readonly threshold?: number;
  /** Which test case fields to show the judge. Default: ['expected', 'input']. */
  readonly references?: ReadonlyArray<"expected" | "input">;
  /** Max retries for malformed judge output. Default: 2. */
  readonly retries?: number;
}

const judgeResponseSchema = z.object({
  reasoning: z.string(),
  score: z.number(),
});

function buildSystemPrompt(rubric: string, scale: { min: number; max: number }): string {
  return `You are an evaluation judge. Your task is to evaluate an LLM output against a rubric.

RUBRIC: ${rubric}

SCORING SCALE: ${scale.min} (worst) to ${scale.max} (best)

You MUST respond with ONLY a JSON object in this exact format:
{
  "reasoning": "Your step-by-step reasoning about the output quality BEFORE deciding on a score",
  "score": <number between ${scale.min} and ${scale.max}>
}

IMPORTANT:
- Think through your reasoning FIRST, then decide on the score
- The "reasoning" field must come before "score" in your response
- Do not include any text outside the JSON object
- The score must be a number between ${scale.min} and ${scale.max}`;
}

function buildUserMessage(
  testCase: TestCase,
  references: ReadonlyArray<"expected" | "input">,
): string {
  const parts: string[] = [];

  if (references.includes("input")) {
    parts.push(`INPUT: ${String(testCase.input)}`);
  }

  parts.push(`OUTPUT (to evaluate): ${testCase.output}`);

  if (references.includes("expected") && testCase.expected !== undefined) {
    parts.push(`REFERENCE/EXPECTED: ${String(testCase.expected)}`);
  }

  return parts.join("\n\n");
}

/**
 * Creates an LLM-as-judge scorer that evaluates outputs using a rubric.
 * Forces structured JSON output with reasoning-before-score to reduce bias.
 *
 * @param options - Judge configuration including model adapter and rubric.
 * @returns A Scorer instance.
 */
export function llmJudge(options: LlmJudgeOptions): Scorer {
  const scale = options.scale ?? { min: 1, max: 5 };
  const threshold = options.threshold ?? 0.6;
  const references = options.references ?? ["expected", "input"];
  const maxRetries = options.retries ?? 2;

  return {
    name: "llmJudge",
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: retry loop with JSON parse recovery requires multiple branches
    async score(testCase: TestCase): Promise<ScoreResult> {
      const start = performance.now();

      const system = buildSystemPrompt(options.rubric, scale);
      const userMessage = buildUserMessage(testCase, references);

      let lastResponse = "";
      let messages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: userMessage },
      ];

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await options.model.complete({
            system,
            messages,
            temperature: 0,
          });

          lastResponse = response.content;

          // Try to extract JSON from the response
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            // Add corrective message for retry
            messages = [
              ...messages,
              { role: "assistant", content: response.content },
              {
                role: "user",
                content:
                  'Your response was not valid JSON. Please respond with ONLY a JSON object: { "reasoning": "...", "score": <number> }',
              },
            ];
            continue;
          }

          const parsed = judgeResponseSchema.safeParse(JSON.parse(jsonMatch[0]));
          if (!parsed.success) {
            messages = [
              ...messages,
              { role: "assistant", content: response.content },
              {
                role: "user",
                content: `Your JSON was malformed: ${parsed.error.message}. Please respond with ONLY: { "reasoning": "...", "score": <number between ${scale.min} and ${scale.max}> }`,
              },
            ];
            continue;
          }

          // Normalize score to 0..1
          const rawScore = parsed.data.score;
          const clamped = Math.max(scale.min, Math.min(scale.max, rawScore));
          const normalized = (clamped - scale.min) / (scale.max - scale.min);
          const passed = normalized >= threshold;

          return {
            scorer: "llmJudge",
            score: normalized,
            passed,
            reason: parsed.data.reasoning,
            raw: { system, userMessage, response: response.content },
            latencyMs: performance.now() - start,
          };
        } catch (err) {
          // Adapter-level error (network, timeout, etc.) — return immediately
          return {
            scorer: "llmJudge",
            score: 0,
            passed: false,
            reason: `Judge adapter failed: ${err instanceof Error ? err.message : String(err)}`,
            error: new AdapterError(
              `Chat adapter failed after ${attempt + 1} attempt(s)`,
              err instanceof Error
                ? { adapterType: "chat" as const, cause: err }
                : { adapterType: "chat" as const },
            ),
            raw: { system, userMessage, response: lastResponse },
            latencyMs: performance.now() - start,
          };
        }
      }

      // All retries exhausted for parse errors
      return {
        scorer: "llmJudge",
        score: 0,
        passed: false,
        reason: `Judge returned unparseable response after ${maxRetries + 1} attempt(s).`,
        error: new JudgeParseError(
          `Failed to parse judge response after ${maxRetries + 1} attempts`,
          { rawResponse: lastResponse, retriesAttempted: maxRetries },
        ),
        raw: { system, userMessage, response: lastResponse },
        latencyMs: performance.now() - start,
      };
    },
  };
}
