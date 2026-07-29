import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { listSlackChannelsTool, readSlackChannelTool, sendSlackMessageTool } from '../tools/slack-tool';
import { lmStudioModel } from '../providers/lm-studio';
import { defaultMemory } from '../memory';
import { defaultScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

const BASE_INSTRUCTIONS = `You are an intelligent Slack assistant that helps manage and respond to Slack communications.

You can:
- List all available Slack channels
- Read recent messages from any channel
- Send messages to channels
- Summarize channel activity
- Draft responses to messages

Use cases:
- "Summarize what happened in #engineering today"
- "Send a message to #general: Server maintenance tonight at 10pm"
- "What are people talking about in #product?"
- "List all channels and their topics"
- "Read the last 5 messages from #random"

When drafting messages:
- Match the tone of the channel (professional in #engineering, casual in #random)
- Be concise and clear
- Use Slack markdown for formatting

To use with real Slack:
1. Create a Slack app at api.slack.com
2. Add Bot Token Scopes: channels:read, channels:history, chat:write
3. Install the app to your workspace
4. Set SLACK_BOT_TOKEN in .env

Currently using demo data if no token is configured.`;

export const slackAgent = new Agent({
  id: 'slack-agent',
  name: 'Slack Agent',
  description: 'Reads Slack channels and sends messages on behalf of the user via the Slack API.',

  // ── Dynamic instructions — inject tenant workspace name ───────────────────
  instructions: async ({ requestContext }) => {
    const tenantId = requestContext?.get?.('tenant-id') as string | undefined;
    const userId   = requestContext?.get?.('user-id')   as string | undefined;

    const tenantNote = tenantId
      ? `\n\nYou are connected to the **${tenantId}** Slack workspace.`
      : '';
    const userNote = userId
      ? `\nMessages you send will be attributed to user: ${userId}.`
      : '';

    return `${BASE_INSTRUCTIONS}${tenantNote}${userNote}`;
  },

  // ── Context schema ─────────────────────────────────────────────────────────
  requestContextSchema: z.object({
    'tenant-id': z.string().optional(),
    'user-id':   z.string().optional(),
  }),

  model: () => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key || key === 'your-google-api-key') {
      return lmStudioModel();
    }
    return 'google/gemini-2.0-flash';
  },
  memory: defaultMemory,
  tools: { listSlackChannelsTool, readSlackChannelTool, sendSlackMessageTool },
  // ── Evals — powers Evaluate + Review tabs in Mastra Studio ───────────────
  scorers: defaultScorerConfig(),
  options: {
    tracingPolicy: defaultTracingPolicy,
  },
});
