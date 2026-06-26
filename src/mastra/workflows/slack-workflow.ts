import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';

const readChannelsStep = createStep({
  id: 'read-channels',
  description: 'List and read recent messages from relevant Slack channels',
  inputSchema: z.object({
    channels: z.array(z.string()).describe('Channel names to read (e.g. ["general", "engineering"])'),
    messageLimit: z.number().optional().describe('Number of recent messages to fetch per channel'),
  }),
  outputSchema: z.object({
    channels: z.array(z.string()),
    channelData: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('slackAgent');
    if (!agent) return { channels: inputData.channels, channelData: '' };
    const limit = inputData.messageLimit ?? 10;
    const result = await agent.generate([
      {
        role: 'user',
        content: `List all channels using slack-list-channels, then read the last ${limit} messages from these channels: ${inputData.channels.join(', ')} using slack-read-channel.`,
      },
    ]);
    return { channels: inputData.channels, channelData: result.text };
  },
});

const summarizeActivityStep = createStep({
  id: 'summarize-activity',
  description: 'Summarize the activity and key topics from the channels',
  inputSchema: z.object({
    channels: z.array(z.string()),
    channelData: z.string(),
  }),
  outputSchema: z.object({
    channels: z.array(z.string()),
    channelData: z.string(),
    summary: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('slackAgent');
    if (!agent) return { ...inputData, summary: inputData.channelData };
    const result = await agent.generate([
      {
        role: 'user',
        content: `Summarize the key activity, topics, and action items from these Slack channels:\n\n${inputData.channelData}\n\nOrganize by channel with bullet points for key topics.`,
      },
    ]);
    return { channels: inputData.channels, channelData: inputData.channelData, summary: result.text };
  },
});

const sendMessageStep = createStep({
  id: 'send-message',
  description: 'Optionally send a message to a Slack channel',
  inputSchema: z.object({
    channels: z.array(z.string()),
    channelData: z.string(),
    summary: z.string(),
  }),
  outputSchema: z.object({
    summary: z.string(),
    messageSent: z.boolean(),
    targetChannel: z.string().optional(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    // Only send if SLACK_BOT_TOKEN is configured and there's a target channel
    if (!process.env.SLACK_BOT_TOKEN) {
      return { summary: inputData.summary, messageSent: false };
    }
    const agent = mastra?.getAgent('slackAgent');
    if (!agent) return { summary: inputData.summary, messageSent: false };
    const targetChannel = inputData.channels[0];
    await agent.generate([
      {
        role: 'user',
        content: `Send this summary to the #${targetChannel} channel using slack-send-message:\n\n${inputData.summary}`,
      },
    ]);
    return { summary: inputData.summary, messageSent: true, targetChannel };
  },
});

export const slackWorkflow = createWorkflow({
  id: 'slack-workflow',
  description: 'Reads Slack channels, summarizes recent activity and key topics, and optionally sends a summary message.',
  requestContextSchema,
  inputSchema: z.object({
    channels: z.array(z.string()).describe('List of channel names to read'),
    messageLimit: z.number().optional().describe('Number of recent messages to read per channel (default: 10)'),
  }),
  outputSchema: z.object({
    summary: z.string(),
    messageSent: z.boolean(),
    targetChannel: z.string().optional(),
  }),
})
  .then(readChannelsStep)
  .then(summarizeActivityStep)
  .then(sendMessageStep);

slackWorkflow.commit();
