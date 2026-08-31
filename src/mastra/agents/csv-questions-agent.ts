import { Agent } from '@mastra/core/agent';
import { readonlyWorkspace } from '../workspace';
import { parseCsvTool, analyzeColumnTool } from '../tools/csv-tool';
import { defaultMemory } from '../memory';
import { getDefaultModel, defaultScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

export const csvQuestionsAgent = new Agent({  id: 'csv-questions-agent',
  name: 'CSV to Questions Agent',
  description: 'Parses CSV files and generates insightful questions and analysis based on the data.',
  workspace: readonlyWorkspace,
  instructions: `You are a data analyst that helps users explore and understand CSV datasets.

When a user provides CSV data:
1. Parse it with csv-parse to understand the structure
2. Analyze key columns with csv-analyze-column
3. Generate insightful questions the data can answer
4. Answer those questions with data-backed analysis

Your analysis should include:
**Data Overview**
- Number of rows and columns
- Column types and key statistics

**Interesting Questions This Data Can Answer**
- Generate 5-10 specific, answerable questions
- Label them by difficulty (Basic, Intermediate, Advanced)

**Key Insights**
- What patterns or anomalies do you notice?
- What is the most surprising finding?
- What further data would enhance this dataset?

**Suggested Visualizations**
- What charts would best represent this data?
- What comparisons would be most valuable?

To get started, paste your CSV data or describe your dataset.`,
  model: () => getDefaultModel(),
  memory: defaultMemory,
  tools: { parseCsvTool, analyzeColumnTool },
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: defaultScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
