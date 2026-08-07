/**
 * scorers/agent-scorers.ts
 *
 * Generic, reusable scorers that apply to any Mastra agent.
 *
 * These scorers power the "Evaluate" and "Review" tabs in Mastra Studio
 * for all 15 agents. They complement the weather-specific scorers in
 * weather-scorer.ts and are designed to be reusable across agent types.
 *
 * Scorers:
 *  - genericCompletenessScorer — does the response fully address the input?
 *  - answerRelevanceScorer     — is the response on-topic? (LLM-judged)
 *  - toxicityScorer            — flags harmful / abusive / inappropriate output (LLM-judged)
 *
 * @see https://mastra.ai/docs/evals/overview
 * @see https://mastra.ai/docs/evals/prebuilt-scorers
 */

import {
  createCompletenessScorer,
  createAnswerRelevancyScorer,
  createToxicityScorer,
} from '@mastra/evals/scorers/prebuilt';
import { lmStudioModel } from '../providers/lm-studio';

// ── Judge model — same string format agents use ───────────────────────────────
// When a Google key is set, use Gemini Flash (gateway string);
// otherwise use the lmStudioModel() instance directly — plain model ID strings
// are rejected by Mastra's gateway router which requires "provider/model" format.
const judgeModel = (() => {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (key && key !== 'your-google-api-key') {
    return 'google/gemini-2.0-flash' as const;
  }
  return lmStudioModel();
})();

// ── Completeness ─────────────────────────────────────────────────────────────
/**
 * Checks whether the assistant response addresses all parts of the user's input.
 * Uses a lightweight heuristic — no LLM call required.
 * Score: 0.0 (partial) → 1.0 (complete)
 */
export const genericCompletenessScorer = createCompletenessScorer();

// ── Answer Relevance ─────────────────────────────────────────────────────────
/**
 * LLM-judged scorer: measures how relevant and on-topic the response is
 * relative to the user's question.
 * Score: 0.0 (off-topic) → 1.0 (highly relevant)
 */
export const answerRelevanceScorer = createAnswerRelevancyScorer({
  model: judgeModel as any,
});

// ── Toxicity ─────────────────────────────────────────────────────────────────
/**
 * LLM-judged scorer: flags outputs containing hate speech, profanity, threats,
 * or abusive content.
 * Score: 0.0 (toxic) → 1.0 (clean)
 */
export const toxicityScorer = createToxicityScorer({
  model: judgeModel as any,
});

// ── Named export for index.ts global scorer registry ─────────────────────────
// Keys are intentionally different from weather-scorer.ts exports to avoid
// name collisions when spread into the global scorers map.
export const agentScorers = {
  genericCompletenessScorer,
  answerRelevanceScorer,
  toxicityScorer,
};
