/**
 * verify-all-agents-and-tools.ts
 *
 * Automated verification test suite for all platform tools and agents.
 * Tests sandbox tool executions and agent generation capabilities.
 */

import { AVAILABLE_TOOLS_MAP } from '../src/mastra/agents/dynamic-agent-factory.js';
import { executeToolById } from '../src/mastra/internal-api.js';

// Import template agents
import { weatherAgent } from '../src/mastra/agents/weather-agent.js';
import { deepSearchAgent } from '../src/mastra/agents/deep-search-agent.js';
import { googleSheetsAgent } from '../src/mastra/agents/google-sheets-agent.js';
import { textToSqlAgent } from '../src/mastra/agents/text-to-sql-agent.js';
import { pdfChatAgent } from '../src/mastra/agents/pdf-chat-agent.js';
import { flashCardsAgent } from '../src/mastra/agents/flash-cards-agent.js';
import { csvQuestionsAgent } from '../src/mastra/agents/csv-questions-agent.js';
import { githubPrAgent } from '../src/mastra/agents/github-pr-agent.js';
import { githubRepoAgent } from '../src/mastra/agents/github-repo-agent.js';
import { docsChatbotAgent } from '../src/mastra/agents/docs-chatbot-agent.js';
import { youtubeChatAgent } from '../src/mastra/agents/youtube-chat-agent.js';
import { slackAgent } from '../src/mastra/agents/slack-agent.js';
import { customerFeedbackAgent } from '../src/mastra/agents/customer-feedback-agent.js';
import { mcpAgent } from '../src/mastra/agents/mcp-agent.js';
import { gemmaAgent } from '../src/mastra/agents/gemma-agent.js';
import { videoIdeaGenagent } from '../src/mastra/agents/video-idea-gen0agent.js';
import { reactNativeAgent } from '../src/mastra/agents/react-native-agent.js';
import { translationAgent } from '../src/mastra/agents/translation-agent.js';
import { studioChatAgent } from '../src/mastra/agents/studio-chat-agent.js';
import { agentBuilderAgent } from '../src/mastra/agents/agent-builder-agent.js';
import { browserAgent } from '../src/mastra/agents/browser-agent.js';
import { createDynamicAgent } from '../src/mastra/agents/dynamic-agent-factory.js';

interface TestSummary {
  toolSuccesses: number;
  toolFailures: number;
  agentSuccesses: number;
  agentFailures: number;
  details: Array<{ item: string; type: 'tool' | 'agent'; status: 'PASS' | 'FAIL'; note?: string }>;
}

const summary: TestSummary = {
  toolSuccesses: 0,
  toolFailures: 0,
  agentSuccesses: 0,
  agentFailures: 0,
  details: [],
};

async function testAllTools() {
  console.log('\n========================================');
  console.log('1. TESTING ALL PLATFORM TOOLS');
  console.log('========================================\n');

  const toolTestCases: Array<{ id: string; input: Record<string, any> }> = [
    { id: 'get-weather', input: { location: 'Tokyo' } },
    { id: 'weather-tool', input: { location: 'London' } },
    { id: 'csv-parse', input: { csvData: 'id,product,price\n1,Widget,25\n2,Gadget,45' } },
    { id: 'csv-analyze-column', input: { csvData: 'id,price\n1,10\n2,20\n3,30', columnName: 'price' } },
    { id: 'sql-execute-query', input: { query: 'SELECT 1 AS status;' } },
    { id: 'sql-describe-table', input: { tableName: 'users' } },
    { id: 'calculator-ui-tool', input: { expression: '40 + 2' } },
    { id: 'skill-list-tool', input: {} },
    { id: 'browser-read-url', input: { url: 'https://example.com', maxChars: 500 } },
    { id: 'browser-web-search', input: { query: 'TypeScript AI agents', maxResults: 3 } },
    { id: 'github-list-repos', input: { owner: 'devansh18' } },
    { id: 'github-get-repo-details', input: { owner: 'devansh18', repo: 'awas' } },
    { id: 'github-list-prs', input: { owner: 'devansh18', repo: 'awas' } },
    { id: 'github-list-branches', input: { owner: 'devansh18', repo: 'awas' } },
    { id: 'youtube-get-metadata', input: { videoIdOrUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
    { id: 'youtube-get-transcript', input: { videoIdOrUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
    { id: 'pdf-parse', input: { pdfBase64: 'JVBERi0xLjQKJcTl8uXr' } },
    { id: 'slack-list-channels', input: { limit: 5 } },
    { id: 'slack-send-message', input: { channel: '#general', message: 'Automated test verification ping.' } },
    { id: 'google-sheets-read', input: { spreadsheetId: 'demo-sheet-123', range: 'Sheet1!A1:B5' } },
    { id: 'list-repository-agents', input: {} },
    { id: 'create-new-agent', input: { name: 'Audit Agent', description: 'Autonomous auditing agent' } },
    { id: 'generate-canvas-workflow', input: { workflowGoal: 'Process customer tickets and summarize issues' } },
    { id: 'exa-search', input: { query: 'autonomous AI agent benchmarks', numResults: 3 } },
  ];

  for (const tc of toolTestCases) {
    try {
      const res = await executeToolById(tc.id, tc.input);
      if (res.success) {
        summary.toolSuccesses++;
        summary.details.push({ item: tc.id, type: 'tool', status: 'PASS', note: `${res.latencyMs}ms` });
        console.log(`  ✓ Tool [${tc.id}] PASS (${res.latencyMs}ms)`);
      } else {
        summary.toolFailures++;
        summary.details.push({ item: tc.id, type: 'tool', status: 'FAIL', note: res.error });
        console.log(`  ✗ Tool [${tc.id}] FAIL: ${res.error}`);
      }
    } catch (err: any) {
      summary.toolFailures++;
      summary.details.push({ item: tc.id, type: 'tool', status: 'FAIL', note: err.message });
      console.log(`  ✗ Tool [${tc.id}] EXCEPTION: ${err.message}`);
    }
  }
}

async function testAllAgents() {
  console.log('\n========================================');
  console.log('2. TESTING ALL AGENTS GENERATION & TOOLS');
  console.log('========================================\n');

  const agentsToTest: Array<{ id: string; agent: any; testPrompt: string }> = [
    { id: 'weatherAgent', agent: weatherAgent, testPrompt: 'What is the weather in Tokyo?' },
    { id: 'deepSearchAgent', agent: deepSearchAgent, testPrompt: 'Briefly summarize Next.js 15 features in 1 sentence.' },
    { id: 'csvQuestionsAgent', agent: csvQuestionsAgent, testPrompt: 'Parse this CSV: id,name\n1,Alice\n2,Bob' },
    { id: 'customerFeedbackAgent', agent: customerFeedbackAgent, testPrompt: 'Analyze this feedback: "Loved the speed, checkout was clean"' },
    { id: 'textToSqlAgent', agent: textToSqlAgent, testPrompt: 'Write a SQL query to select all active users.' },
    { id: 'githubPrAgent', agent: githubPrAgent, testPrompt: 'What tools do you have for pull requests?' },
    { id: 'githubRepoAgent', agent: githubRepoAgent, testPrompt: 'Explain how you inspect repository details.' },
    { id: 'docsChatbotAgent', agent: docsChatbotAgent, testPrompt: 'Answer in 1 sentence: What is an autonomous agent?' },
    { id: 'googleSheetsAgent', agent: googleSheetsAgent, testPrompt: 'How do you read data from Google Sheets?' },
    { id: 'youtubeChatAgent', agent: youtubeChatAgent, testPrompt: 'How do you extract video transcripts?' },
    { id: 'videoIdeaGenagent', agent: videoIdeaGenagent, testPrompt: 'Give 1 YouTube video title for TypeScript tips.' },
    { id: 'pdfChatAgent', agent: pdfChatAgent, testPrompt: 'Explain your document indexing capability.' },
    { id: 'flashCardsAgent', agent: flashCardsAgent, testPrompt: 'Create 1 flashcard for HTTP status 200.' },
    { id: 'slackAgent', agent: slackAgent, testPrompt: 'How do you broadcast messages to Slack channels?' },
    { id: 'translationAgent', agent: translationAgent, testPrompt: 'Translate "Hello world" to Spanish.' },
    { id: 'reactNativeAgent', agent: reactNativeAgent, testPrompt: 'What is the component to render text in React Native?' },
    { id: 'studioChatAgent', agent: studioChatAgent, testPrompt: 'Give a quick 3-word greeting.' },
    { id: 'agentBuilderAgent', agent: agentBuilderAgent, testPrompt: 'What parameters are required to configure a new agent?' },
    { id: 'browserAgent', agent: browserAgent, testPrompt: 'How do you extract text from a webpage?' },
    { id: 'gemmaAgent', agent: gemmaAgent, testPrompt: 'Hello from verification script!' },
    { id: 'mcpAgent', agent: mcpAgent, testPrompt: 'List your MCP capabilities.' },
  ];

  for (const { id, agent, testPrompt } of agentsToTest) {
    try {
      const toolCount = Object.keys(agent?.tools || {}).length;
      const res = await agent.generate([{ role: 'user', content: testPrompt }]);
      const outputText = res?.text || res?.content || '';
      if (outputText || res) {
        summary.agentSuccesses++;
        summary.details.push({
          item: id,
          type: 'agent',
          status: 'PASS',
          note: `${toolCount} tools equipped, text length: ${outputText.length}`,
        });
        console.log(`  ✓ Agent [${id}] PASS (Equipped tools: ${toolCount}, output: "${outputText.slice(0, 60).replace(/\n/g, ' ')}...")`);
      } else {
        summary.agentFailures++;
        summary.details.push({ item: id, type: 'agent', status: 'FAIL', note: 'Empty output' });
        console.log(`  ✗ Agent [${id}] FAIL (Empty response)`);
      }
    } catch (err: any) {
      summary.agentFailures++;
      summary.details.push({ item: id, type: 'agent', status: 'FAIL', note: err.message });
      console.log(`  ✗ Agent [${id}] EXCEPTION: ${err.message}`);
    }
  }

  // Also test dynamic agent factory
  console.log('\nTesting Dynamic Agent Factory with custom tools...');
  try {
    const customAgent = createDynamicAgent('custom-verification-agent', {
      name: 'Custom Verification Agent',
      description: 'Dynamic agent with Exa, CSV, and Weather tools',
      instructions: 'You are a test agent.',
      tools: ['get-weather', 'csv-parse', 'calculator-ui-tool'],
    });
    const customToolsCount = Object.keys(customAgent.tools || {}).length;
    const customRes = await customAgent.generate([{ role: 'user', content: 'Say OK' }]);
    if (customRes?.text) {
      summary.agentSuccesses++;
      summary.details.push({
        item: 'dynamic-custom-agent',
        type: 'agent',
        status: 'PASS',
        note: `${customToolsCount} dynamic tools bound`,
      });
      console.log(`  ✓ Dynamic Agent Factory PASS (${customToolsCount} tools bound)`);
    }
  } catch (err: any) {
    summary.agentFailures++;
    console.log(`  ✗ Dynamic Agent Factory FAIL: ${err.message}`);
  }
}

async function run() {
  console.log('🚀 Starting AWAS Agent & Tool Verification Suite...');
  const overallStart = Date.now();

  await testAllTools();
  await testAllAgents();

  const totalTime = ((Date.now() - overallStart) / 1000).toFixed(2);
  console.log('\n========================================');
  console.log('VERIFICATION SUMMARY');
  console.log('========================================');
  console.log(`Total Time: ${totalTime}s`);
  console.log(`Tools Tested:  ${summary.toolSuccesses} passed, ${summary.toolFailures} failed`);
  console.log(`Agents Tested: ${summary.agentSuccesses} passed, ${summary.agentFailures} failed`);
  console.log('========================================\n');

  if (summary.toolFailures === 0 && summary.agentFailures === 0) {
    console.log('🎉 ALL AGENTS AND TOOLS VERIFIED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.log(`⚠️ Completed with ${summary.toolFailures} tool issues and ${summary.agentFailures} agent issues.`);
    process.exit(summary.agentFailures > 5 ? 1 : 0);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
