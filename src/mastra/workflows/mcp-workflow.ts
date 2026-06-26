import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const planTaskStep = createStep({
  id: 'plan-task',
  description: 'Use sequential thinking to plan the task before execution',
  inputSchema: z.object({
    task: z.string().describe('The task to accomplish using MCP tools'),
  }),
  outputSchema: z.object({
    task: z.string(),
    plan: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('mcpAgent');
    if (!agent) return { task: inputData.task, plan: inputData.task };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Use the sequentialthinking tool to create a step-by-step plan for this task:\n\n"${inputData.task}"\n\nDo not execute yet — only plan.`,
      },
    ]);
    return { task: inputData.task, plan: result.text };
  },
});

const executeStepsStep = createStep({
  id: 'execute-steps',
  description: 'Execute the planned steps using filesystem and MCP tools',
  inputSchema: z.object({
    task: z.string(),
    plan: z.string(),
  }),
  outputSchema: z.object({
    task: z.string(),
    plan: z.string(),
    executionResult: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('mcpAgent');
    if (!agent) return { ...inputData, executionResult: '' };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Execute this plan step by step using your filesystem and MCP tools:\n\nTask: ${inputData.task}\n\nPlan:\n${inputData.plan}\n\nConfirm before writing or modifying any files.`,
      },
    ]);
    return { task: inputData.task, plan: inputData.plan, executionResult: result.text };
  },
});

const summarizeResultStep = createStep({
  id: 'summarize-result',
  description: 'Summarize what was accomplished and any relevant file paths',
  inputSchema: z.object({
    task: z.string(),
    plan: z.string(),
    executionResult: z.string(),
  }),
  outputSchema: z.object({
    task: z.string(),
    summary: z.string(),
    filesAffected: z.array(z.string()),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('mcpAgent');
    if (!agent) return { task: inputData.task, summary: inputData.executionResult, filesAffected: [] };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Summarize the results of this task execution. List any files that were created, read, or modified.\n\nTask: ${inputData.task}\n\nExecution result:\n${inputData.executionResult}\n\nRespond in JSON: {"summary": "...", "filesAffected": ["..."]}`,
      },
    ]);
    let parsed: { summary?: string; filesAffected?: string[] } = {};
    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch { /* fallback */ }
    return { task: inputData.task, summary: parsed.summary ?? result.text, filesAffected: parsed.filesAffected ?? [] };
  },
});

export const mcpWorkflow = createWorkflow({
  id: 'mcp-workflow',
  description: 'Plans a task using sequential thinking, executes it with filesystem/MCP tools, and returns a structured summary.',
  requestContextSchema,
  inputSchema: z.object({
    task: z.string().describe('The task to plan and execute using MCP tools'),
  }),
  outputSchema: z.object({
    task: z.string(),
    summary: z.string(),
    filesAffected: z.array(z.string()),
  }),
})
  .then(planTaskStep)
  .then(executeStepsStep)
  .then(summarizeResultStep);

mcpWorkflow.commit();
