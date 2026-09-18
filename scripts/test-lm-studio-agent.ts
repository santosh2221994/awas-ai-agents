import { studioChatAgent } from '../src/mastra/agents/studio-chat-agent.js';
import { gemmaAgent } from '../src/mastra/agents/gemma-agent.js';

async function testAgents() {
  console.log('Testing gemmaAgent with LM Studio...');
  try {
    const gemmaRes = await gemmaAgent.generate(
      [{ role: 'user', content: 'Say hello in 3 words' }]
    );
    console.log('✓ gemmaAgent response:', gemmaRes.text);
  } catch (err: any) {
    console.error('gemmaAgent error:', err);
  }

  console.log('\nTesting studioChatAgent with LM Studio...');
  try {
    const studioRes = await studioChatAgent.generate(
      [{ role: 'user', content: 'Say hello in 3 words' }]
    );
    console.log('✓ studioChatAgent response:', studioRes.text);
  } catch (err: any) {
    console.error('studioChatAgent error:', err);
  }
}

testAgents();
