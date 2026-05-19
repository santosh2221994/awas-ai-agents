import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Slack Tool — send/read messages via Slack Web API.
// Set SLACK_BOT_TOKEN in .env for real integration.
// Without it, returns mock data.
// ---------------------------------------------------------------------------

const SLACK_BASE = 'https://slack.com/api';

async function slackFetch(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error('SLACK_BOT_TOKEN not set');
  const res = await fetch(`${SLACK_BASE}/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!data['ok']) throw new Error(`Slack API error: ${data['error']}`);
  return data;
}

export const listSlackChannelsTool = createTool({
  id: 'slack-list-channels',
  description: 'List all public Slack channels in the workspace.',
  inputSchema: z.object({ limit: z.number().default(20) }),
  outputSchema: z.object({
    channels: z.array(z.object({ id: z.string(), name: z.string(), memberCount: z.number(), topic: z.string() })),
  }),
  execute: async (inputData) => {
    if (!process.env.SLACK_BOT_TOKEN) {
      return {
        channels: [
          { id: 'C001', name: 'general', memberCount: 42, topic: 'Company-wide announcements' },
          { id: 'C002', name: 'engineering', memberCount: 18, topic: 'Tech discussions and updates' },
          { id: 'C003', name: 'random', memberCount: 40, topic: 'Off-topic fun' },
          { id: 'C004', name: 'product', memberCount: 12, topic: 'Product planning and feedback' },
        ],
      };
    }
    const data = await slackFetch('conversations.list', { limit: inputData.limit, types: 'public_channel' }) as {
      channels: Array<{ id: string; name: string; num_members: number; topic: { value: string } }>;
    };
    return {
      channels: data.channels.map((c) => ({ id: c.id, name: c.name, memberCount: c.num_members, topic: c.topic.value })),
    };
  },
});

export const readSlackChannelTool = createTool({
  id: 'slack-read-messages',
  description: 'Read the latest messages from a Slack channel.',
  inputSchema: z.object({
    channelId: z.string().describe('Slack channel ID (e.g. C001ABCD)'),
    limit: z.number().default(10).describe('Number of messages to retrieve'),
  }),
  outputSchema: z.object({
    messages: z.array(z.object({ text: z.string(), author: z.string(), timestamp: z.string() })),
  }),
  execute: async (inputData) => {
    if (!process.env.SLACK_BOT_TOKEN) {
      return {
        messages: [
          { text: 'Hey team, the new deploy is live!', author: 'alice', timestamp: new Date(Date.now() - 3600000).toISOString() },
          { text: 'Great work everyone! The new feature looks amazing.', author: 'bob', timestamp: new Date(Date.now() - 1800000).toISOString() },
          { text: 'Any issues reported from users so far?', author: 'carol', timestamp: new Date(Date.now() - 900000).toISOString() },
        ],
      };
    }
    const data = await slackFetch('conversations.history', { channel: inputData.channelId, limit: inputData.limit }) as {
      messages: Array<{ text: string; username?: string; user?: string; ts: string }>;
    };
    return {
      messages: data.messages.map((m) => ({
        text: m.text,
        author: m.username ?? m.user ?? 'unknown',
        timestamp: new Date(parseFloat(m.ts) * 1000).toISOString(),
      })),
    };
  },
});

export const sendSlackMessageTool = createTool({
  id: 'slack-send-message',
  description: 'Send a message to a Slack channel.',
  inputSchema: z.object({
    channelId: z.string().describe('Slack channel ID or name'),
    text: z.string().describe('Message text (supports markdown)'),
  }),
  outputSchema: z.object({ success: z.boolean(), messageTs: z.string().optional(), note: z.string().optional() }),
  execute: async (inputData) => {
    if (!process.env.SLACK_BOT_TOKEN) {
      return { success: true, messageTs: String(Date.now()), note: '(stub) Set SLACK_BOT_TOKEN to send real messages.' };
    }
    const data = await slackFetch('chat.postMessage', { channel: inputData.channelId, text: inputData.text }) as { ts: string };
    return { success: true, messageTs: data.ts };
  },
});
