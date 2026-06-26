import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const listTablesStep = createStep({
  id: 'list-tables',
  description: 'List all database tables and their schemas',
  inputSchema: z.object({
    question: z.string().describe('Natural language question to answer with SQL'),
  }),
  outputSchema: z.object({
    question: z.string(),
    schema: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('textToSqlAgent');
    if (!agent) return { question: inputData.question, schema: '' };
    const result = await agent.generate([
      { role: 'user', content: 'Use sql-list-tables to list all available tables and describe their columns and types.' },
    ]);
    return { question: inputData.question, schema: result.text };
  },
});

const generateSqlStep = createStep({
  id: 'generate-sql',
  description: 'Generate a SQL query that answers the natural language question',
  inputSchema: z.object({
    question: z.string(),
    schema: z.string(),
  }),
  outputSchema: z.object({
    question: z.string(),
    schema: z.string(),
    sqlQuery: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('textToSqlAgent');
    if (!agent) return { ...inputData, sqlQuery: '' };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Database schema:\n${inputData.schema}\n\nGenerate a SELECT query (no INSERT/UPDATE/DELETE) to answer:\n"${inputData.question}"\n\nExplain what the query does, then provide the SQL in a code block.`,
      },
    ]);
    const sqlMatch = result.text.match(/```(?:sql)?\s*([\s\S]*?)```/);
    const sqlQuery = sqlMatch?.[1]?.trim() ?? result.text;
    return { question: inputData.question, schema: inputData.schema, sqlQuery };
  },
});

const executeQueryStep = createStep({
  id: 'execute-query',
  description: 'Execute the generated SQL query against the database',
  inputSchema: z.object({
    question: z.string(),
    schema: z.string(),
    sqlQuery: z.string(),
  }),
  outputSchema: z.object({
    question: z.string(),
    sqlQuery: z.string(),
    rawResults: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('textToSqlAgent');
    if (!agent) return { question: inputData.question, sqlQuery: inputData.sqlQuery, rawResults: '' };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Execute this SQL query using sql-execute-query and return the raw results:\n\n\`\`\`sql\n${inputData.sqlQuery}\n\`\`\``,
      },
    ]);
    return { question: inputData.question, sqlQuery: inputData.sqlQuery, rawResults: result.text };
  },
});

const explainResultsStep = createStep({
  id: 'explain-results',
  description: 'Explain the query results in plain language',
  inputSchema: z.object({
    question: z.string(),
    sqlQuery: z.string(),
    rawResults: z.string(),
  }),
  outputSchema: z.object({
    question: z.string(),
    sqlQuery: z.string(),
    explanation: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('textToSqlAgent');
    if (!agent) return { question: inputData.question, sqlQuery: inputData.sqlQuery, explanation: inputData.rawResults };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Original question: "${inputData.question}"\n\nSQL query used:\n${inputData.sqlQuery}\n\nQuery results:\n${inputData.rawResults}\n\nExplain the results in plain language, highlighting the key findings.`,
      },
    ]);
    return { question: inputData.question, sqlQuery: inputData.sqlQuery, explanation: result.text };
  },
});

export const textToSqlWorkflow = createWorkflow({
  id: 'text-to-sql-workflow',
  description: 'Converts a natural language question into SQL, executes it against the database, and explains the results in plain language.',
  requestContextSchema,
  inputSchema: z.object({
    question: z.string().describe('Natural language question to answer using the database'),
  }),
  outputSchema: z.object({
    question: z.string(),
    sqlQuery: z.string(),
    explanation: z.string(),
  }),
})
  .then(listTablesStep)
  .then(generateSqlStep)
  .then(executeQueryStep)
  .then(explainResultsStep);

textToSqlWorkflow.commit();
