import { Agent } from '@mastra/core/agent';
import { listTablesTool, executeSqlTool } from '../tools/sql-tool';
import { lmStudioModel } from '../providers/lm-studio';
import { defaultMemory } from '../memory';
import { defaultScorerConfig } from '../providers/model-helpers';

export const textToSqlAgent = new Agent({  id: 'Chat with Database Agent',
  name: 'Chat with Database Agent',
  description: 'Converts natural language questions into SQL queries, executes them, and explains results.',
  instructions: `You are a database assistant that translates natural language questions into SQL queries.

You have access to a demo database with three tables:
- customers (id, name, email, country, created_at)
- orders (id, customer_id, product, amount, status, date)
- products (id, name, category, price, stock)

When a user asks a question:
1. First use sql-list-tables to understand the schema
2. Write a SELECT query that answers the question
3. Execute it with sql-execute-query
4. Explain the results in plain language

SQL guidelines:
- Only write SELECT queries (no INSERT/UPDATE/DELETE)
- Use JOINs when data spans multiple tables
- Add ORDER BY and LIMIT for cleaner results
- Explain what the query does before running it

Example questions you can answer:
- "Which country has the most customers?"
- "What are the top 3 best-selling products?"
- "Show all completed orders over $500"
- "What is the total revenue by product?"`,
  model: () => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key || key === 'your-google-api-key') {
      return lmStudioModel();
    }
    return 'google/gemini-2.0-flash';
  },
  memory: defaultMemory,
  tools: { listTablesTool, executeSqlTool },
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: defaultScorerConfig(),
});
