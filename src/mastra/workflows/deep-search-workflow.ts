import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

// ---------------------------------------------------------------------------
// Deep Search Workflow
// Multi-step research workflow: clarify → search → evaluate → synthesize.
// ---------------------------------------------------------------------------

const clarifyStep = createStep({
  id: 'clarify-question',
  description: 'Clarify and expand the research question into sub-questions',
  inputSchema: z.object({
    question: z.string().describe('The original research question'),
  }),
  outputSchema: z.object({
    originalQuestion: z.string(),
    subQuestions: z.array(z.string()),
    searchQueries: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('deepSearchAgent');
    if (!agent) {
      return {
        originalQuestion: inputData.question,
        subQuestions: [inputData.question],
        searchQueries: [inputData.question],
      };
    }
    const result = await agent.generate([
      {
        role: 'user',
        content: `Break this research question into 3-5 specific sub-questions and generate 3 search queries.

Question: "${inputData.question}"

Respond ONLY in JSON (no other text):
{"subQuestions": ["...", "..."], "searchQueries": ["...", "...", "..."]}`,
      },
    ]);
    let parsed: { subQuestions?: string[]; searchQueries?: string[] } = {};
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch { /* fallback */ }
    return {
      originalQuestion: inputData.question,
      subQuestions: parsed.subQuestions ?? [inputData.question],
      searchQueries: parsed.searchQueries ?? [inputData.question],
    };
  },
});

const searchStep = createStep({
  id: 'search-and-gather',
  description: 'Search the web for information using the prepared queries',
  inputSchema: z.object({
    originalQuestion: z.string(),
    subQuestions: z.array(z.string()),
    searchQueries: z.array(z.string()),
  }),
  outputSchema: z.object({
    originalQuestion: z.string(),
    subQuestions: z.array(z.string()),
    searchResults: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('deepSearchAgent');
    if (!agent) {
      return {
        originalQuestion: inputData.originalQuestion,
        subQuestions: inputData.subQuestions,
        searchResults: `No agent available. Queries were: ${inputData.searchQueries.join(', ')}`,
      };
    }
    const queries = inputData.searchQueries.slice(0, 3).join('\n- ');
    const result = await agent.generate([
      {
        role: 'user',
        content: `Search for information on these queries and compile findings:

Queries:
- ${queries}

Use the exa-search tool for each query, then compile a comprehensive summary with source URLs.`,
      },
    ]);
    return {
      originalQuestion: inputData.originalQuestion,
      subQuestions: inputData.subQuestions,
      searchResults: result.text,
    };
  },
});

const evaluateStep = createStep({
  id: 'evaluate-results',
  description: 'Evaluate whether the search results adequately answer the research question',
  inputSchema: z.object({
    originalQuestion: z.string(),
    subQuestions: z.array(z.string()),
    searchResults: z.string(),
  }),
  outputSchema: z.object({
    originalQuestion: z.string(),
    searchResults: z.string(),
    isComplete: z.boolean(),
    gaps: z.array(z.string()),
    confidenceScore: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('deepSearchAgent');
    if (!agent) {
      return {
        originalQuestion: inputData.originalQuestion,
        searchResults: inputData.searchResults,
        isComplete: true,
        gaps: [],
        confidenceScore: 0.6,
      };
    }
    const result = await agent.generate([
      {
        role: 'user',
        content: `Evaluate if these results adequately answer the question.

Question: "${inputData.originalQuestion}"
Sub-questions: ${inputData.subQuestions.join(', ')}

Results:
${inputData.searchResults}

Respond ONLY in JSON:
{"isComplete": true, "confidenceScore": 0.8, "gaps": ["..."]}`,
      },
    ]);
    let parsed: { isComplete?: boolean; confidenceScore?: number; gaps?: string[] } = {};
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch { /* fallback */ }
    return {
      originalQuestion: inputData.originalQuestion,
      searchResults: inputData.searchResults,
      isComplete: parsed.isComplete ?? true,
      gaps: parsed.gaps ?? [],
      confidenceScore: parsed.confidenceScore ?? 0.7,
    };
  },
});

const synthesizeStep = createStep({
  id: 'synthesize-answer',
  description: 'Synthesize all research into a comprehensive, sourced final answer',
  inputSchema: z.object({
    originalQuestion: z.string(),
    searchResults: z.string(),
    isComplete: z.boolean(),
    gaps: z.array(z.string()),
    confidenceScore: z.number(),
  }),
  outputSchema: z.object({
    question: z.string(),
    answer: z.string(),
    confidenceScore: z.number(),
    gaps: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('deepSearchAgent');
    if (!agent) {
      return {
        question: inputData.originalQuestion,
        answer: inputData.searchResults,
        confidenceScore: inputData.confidenceScore,
        gaps: inputData.gaps,
      };
    }
    const result = await agent.generate([
      {
        role: 'user',
        content: `Synthesize the following research into a comprehensive answer.

Original Question: "${inputData.originalQuestion}"

Research Findings:
${inputData.searchResults}

${inputData.gaps.length > 0 ? `Known Gaps: ${inputData.gaps.join(', ')}` : ''}

Write a well-structured answer with:
1. Direct answer to the question
2. Supporting evidence with citations [source](url)
3. Important caveats
4. Confidence level explanation`,
      },
    ]);
    return {
      question: inputData.originalQuestion,
      answer: result.text,
      confidenceScore: inputData.confidenceScore,
      gaps: inputData.gaps,
    };
  },
});

export const deepSearchWorkflow = createWorkflow({
  id: 'deep-search-workflow',
  description: 'Multi-step web research workflow: clarify question → search → evaluate sources → synthesize cited answer.',
  requestContextSchema,
  inputSchema: z.object({
    question: z.string().describe('The research question to investigate'),
  }),
  outputSchema: z.object({
    question: z.string(),
    answer: z.string(),
    confidenceScore: z.number(),
    gaps: z.array(z.string()),
  }),
})
  .then(clarifyStep)
  .then(searchStep)
  .then(evaluateStep)
  .then(synthesizeStep);

deepSearchWorkflow.commit();
