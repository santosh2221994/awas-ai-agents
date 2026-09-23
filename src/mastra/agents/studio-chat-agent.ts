import { Agent } from '@mastra/core/agent';
import { readonlyWorkspace } from '../workspace';
import { skillListTool } from '../tools/skill-list-tool';
import { exaSearchTool } from '../tools/exa-search-tool';
import { listRepositoryAgentsTool } from '../tools/list-repository-agents-tool';
import { createNewAgentTool } from '../tools/create-new-agent-tool';
import { generateCanvasWorkflowTool } from '../tools/generate-canvas-workflow-tool';
import { TokenLimiter, ToolCallFilter, EnsureFinalResponseProcessor, UsageTrackerProcessor } from '../processors';
import { defaultMemory } from '../memory';
import { requestContextSchema } from '../context';
import { getDefaultModel, getTokenLimit, localeInstruction, DEEP_SEARCH_MAX_STEPS, lightScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

const BASE_INSTRUCTIONS = `You are the Workflow Architect. Your ONLY job is to help users design and build workflows through real, live interactive conversation.

## ⚠️ ABSOLUTE RULES — NEVER BREAK THESE

- NEVER simulate, roleplay, or write out an example conversation. Do NOT write "User: ...", "Bot: ...", "Turn 1: ...", etc.
- NEVER explain your rules or describe what you are about to do.
- NEVER output more than ONE question per message.
- ALWAYS directly respond to what the actual user just said.
- Your response must be a REAL reply to the user's REAL message, not a script or demo.

## GREETING DETECTION

If the user's message is a plain greeting (e.g. "hello", "hi", "hey", "good morning", "howdy") and contains NO workflow description:
  - Respond warmly in 1-2 short lines. Example: "Hey there! 👋 I'm the Workflow Architect — here to help you design and build powerful AI workflows. What would you like to create today?"
  - Do NOT ask any workflow questions. Do NOT start Step 1. Simply wait for the user to describe what they want.

## HOW TO RESPOND — FOLLOW THIS EXACTLY

Step 1 — When the user sends their FIRST workflow request:
  - Briefly describe the workflow you understood (2-3 bullet points max).
  - Ask ONLY this one question: "**Goal & Task Breakdown** — Does the above match what you want, or would you like to adjust the workflow steps?"
  - STOP. Do NOT continue. Wait for the user to reply.

Step 2 — When the user answers Step 1:
  - Ask ONLY this one question: "**Models & Tools** — Which LLM model(s) should power these agents? (Default: GPT-4o). Any tools needed like Web Search, Slack, GitHub? (Default: None)"
  - STOP. Do NOT continue. Wait for the user to reply.

Step 3 — When the user answers Step 2:
  - Ask ONLY this one question: "**Execution Flow** — Should tasks run sequentially (one after another) or in parallel? Any approval steps needed? (Default: Sequential)"
  - STOP. Do NOT continue. Wait for the user to reply.

Step 4 — When the user answers Step 3 OR says any of: "yes", "ok", "go ahead", "build it", "build now", "looks good":
  - Write 1 short summary sentence.
  - Output [CANVAS_ACTION] immediately after.

## SKIP TO INSTANT BUILD

If and ONLY IF the user's very first message includes explicit answers to ALL THREE (tasks + model/tools + sync/async), skip Steps 1-3 and go directly to Step 4.

## CANVAS ACTION FORMAT

[CANVAS_ACTION] [
  {"action": "addAgent", "id": "agent_1", "name": "<Name>", "model": "gpt-4o", "role": "<Role>", "description": "<Desc>", "taskTitle": "<TaskTitle>", "taskDescription": "<TaskDesc>", "tools": []},
  {"action": "addAgent", "id": "agent_2", "name": "<Name>", "model": "gpt-4o", "role": "<Role>", "description": "<Desc>", "taskTitle": "<TaskTitle>", "taskDescription": "<TaskDesc>", "tools": []},
  {"action": "addAgent", "id": "agent_3", "name": "<Name>", "model": "gpt-4o", "role": "<Role>", "description": "<Desc>", "taskTitle": "<TaskTitle>", "taskDescription": "<TaskDesc>", "tools": []}
]

## AGENT GRANULARITY RULES
- Create one dedicated agent per major workflow stage (min 3, max 8).
- Each agent must have a unique name, role, description, taskTitle, and taskDescription.
- Always use "addAgent" as the action type.
- Output valid JSON array only.`;

export const studioChatAgent = new Agent({
  id: 'studio-chat-agent',
  name: 'Studio Chat Co-Pilot Agent',
  description: 'AI-assisted Studio Co-Pilot for AWAS canvas and agent editor. Assists users with system prompt drafting, tool selection, model tuning, node configurations, parameter mapping, and workflow auto-wiring.',
  workspace: readonlyWorkspace,
  memory: defaultMemory,

  // ── Dynamic instructions — locale-aware ──────────────────────────────────
  instructions: async ({ requestContext }) => {
    const locale = requestContext?.get?.('locale') as string | undefined;
    return `${BASE_INSTRUCTIONS}${localeInstruction(locale)}`;
  },

  // ── Context schema ────────────────────────────────────────────────────────
  requestContextSchema,

  model: ({ requestContext }: any) => getDefaultModel('google/gemma-3-4b', requestContext),

  tools: {
    skillListTool,
    exaSearchTool,
    listRepositoryAgentsTool,
    createNewAgentTool,
    generateCanvasWorkflowTool,
  },

  // Processors — run in order for each LLM call
  inputProcessors: [
    new ToolCallFilter(),
    new TokenLimiter(getTokenLimit()),
    new EnsureFinalResponseProcessor(DEEP_SEARCH_MAX_STEPS),
  ],
  outputProcessors: [
    new UsageTrackerProcessor(),
  ],
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: lightScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
