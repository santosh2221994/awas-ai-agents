import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

// ---------------------------------------------------------------------------
// Customer Feedback Summarization Workflow
// ---------------------------------------------------------------------------

const feedbackItemSchema = z.object({
  text: z.string(),
  category: z.string(),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
});

const categorizeFeedbackStep = createStep({
  id: 'categorize-feedback',
  description: 'Categorize and tag each piece of feedback',
  inputSchema: z.object({
    feedbackItems: z.array(z.string()).describe('List of customer feedback strings'),
    source: z.string().default('general'),
  }),
  outputSchema: z.object({
    categorized: z.array(feedbackItemSchema),
    source: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('customerFeedbackAgent');
    if (!agent) {
      return {
        categorized: inputData.feedbackItems.map((text) => ({
          text, category: 'general', sentiment: 'neutral' as const, priority: 'medium' as const,
        })),
        source: inputData.source ?? 'general',
      };
    }
    const result = await agent.generate([
      {
        role: 'user',
        content: `Categorize each feedback item. For each: category (bug_report|feature_request|praise|complaint|question), sentiment (positive|neutral|negative), priority (critical|high|medium|low).

Feedback (source: ${inputData.source}):
${inputData.feedbackItems.map((f, i) => `${i + 1}. "${f}"`).join('\n')}

Respond ONLY in JSON array:
[{"text": "...", "category": "...", "sentiment": "...", "priority": "..."}, ...]`,
      },
    ]);
    let categorized: Array<{ text: string; category: string; sentiment: 'positive' | 'neutral' | 'negative'; priority: 'critical' | 'high' | 'medium' | 'low' }> = [];
    try {
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) categorized = JSON.parse(jsonMatch[0]);
    } catch {
      categorized = inputData.feedbackItems.map((text) => ({ text, category: 'general', sentiment: 'neutral' as const, priority: 'medium' as const }));
    }
    return { categorized, source: inputData.source ?? 'general' };
  },
});

const analyzeThemesStep = createStep({
  id: 'analyze-themes',
  description: 'Identify recurring themes and patterns across all feedback',
  inputSchema: z.object({
    categorized: z.array(feedbackItemSchema),
    source: z.string(),
  }),
  outputSchema: z.object({
    themes: z.array(z.object({ theme: z.string(), count: z.number(), sentiment: z.string(), priority: z.string() })),
    sentimentScore: z.number(),
    criticalIssues: z.array(z.string()),
    categorized: z.array(feedbackItemSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('customerFeedbackAgent');
    if (!agent) {
      return { themes: [], sentimentScore: 5, criticalIssues: [], categorized: inputData.categorized };
    }
    const feedbackSummary = inputData.categorized.map((f) => `[${f.category}/${f.sentiment}/${f.priority}] ${f.text}`).join('\n');
    const result = await agent.generate([
      {
        role: 'user',
        content: `Analyze these categorized feedback items and identify themes.

${feedbackSummary}

Respond ONLY in JSON:
{"themes": [{"theme": "...", "count": 1, "sentiment": "...", "priority": "..."}], "sentimentScore": 7, "criticalIssues": ["..."]}`,
      },
    ]);
    let parsed: { themes?: Array<{ theme: string; count: number; sentiment: string; priority: string }>; sentimentScore?: number; criticalIssues?: string[] } = {};
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch { /* fallback */ }
    return {
      themes: parsed.themes ?? [],
      sentimentScore: parsed.sentimentScore ?? 5,
      criticalIssues: parsed.criticalIssues ?? [],
      categorized: inputData.categorized,
    };
  },
});

const generateReportStep = createStep({
  id: 'generate-report',
  description: 'Generate an executive summary report with actionable recommendations',
  inputSchema: z.object({
    themes: z.array(z.object({ theme: z.string(), count: z.number(), sentiment: z.string(), priority: z.string() })),
    sentimentScore: z.number(),
    criticalIssues: z.array(z.string()),
    categorized: z.array(feedbackItemSchema),
  }),
  outputSchema: z.object({
    report: z.string(),
    sentimentScore: z.number(),
    topThemes: z.array(z.string()),
    criticalIssues: z.array(z.string()),
    totalFeedbackAnalyzed: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('customerFeedbackAgent');
    if (!agent) {
      return {
        report: 'No agent available.',
        sentimentScore: inputData.sentimentScore,
        topThemes: inputData.themes.slice(0, 5).map((t) => t.theme),
        criticalIssues: inputData.criticalIssues,
        totalFeedbackAnalyzed: inputData.categorized.length,
      };
    }
    const result = await agent.generate([
      {
        role: 'user',
        content: `Generate an executive customer feedback report.

Overall Sentiment Score: ${inputData.sentimentScore}/10
Total Feedback Items: ${inputData.categorized.length}
Critical Issues: ${inputData.criticalIssues.join(', ') || 'None'}

Top Themes:
${inputData.themes.map((t) => `- ${t.theme} (mentioned ${t.count}x, ${t.sentiment}, ${t.priority} priority)`).join('\n')}

Generate a professional 3-section report:
1. Executive Summary (2-3 sentences)
2. Key Findings (bullets with data)
3. Recommended Actions (prioritized list with owner teams)`,
      },
    ]);
    return {
      report: result.text,
      sentimentScore: inputData.sentimentScore,
      topThemes: inputData.themes.slice(0, 5).map((t) => t.theme),
      criticalIssues: inputData.criticalIssues,
      totalFeedbackAnalyzed: inputData.categorized.length,
    };
  },
});

export const customerFeedbackWorkflow = createWorkflow({
  id: 'customer-feedback-workflow',
  description: 'Analyzes customer feedback items: categorizes, identifies themes, and generates an executive summary with recommendations.',
  requestContextSchema,
  inputSchema: z.object({
    feedbackItems: z.array(z.string()).describe('Array of customer feedback strings to analyze'),
    source: z.string().default('general').describe('Source of feedback (app-reviews, support-tickets, survey)'),
  }),
  outputSchema: z.object({
    report: z.string(),
    sentimentScore: z.number(),
    topThemes: z.array(z.string()),
    criticalIssues: z.array(z.string()),
    totalFeedbackAnalyzed: z.number(),
  }),
})
  .then(categorizeFeedbackStep)
  .then(analyzeThemesStep)
  .then(generateReportStep);

customerFeedbackWorkflow.commit();
