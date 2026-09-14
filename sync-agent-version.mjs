#!/usr/bin/env node
// Reads the live agent tool schemas and POSTs a new stored version to Mastra
// so the Studio Editor tab shows all 5 tools.

const BASE_URL = 'http://localhost:4111';
const AGENT_ID = 'studio-chat-agent';

async function main() {
  // 1. Fetch the live agent definition
  const liveRes = await fetch(`${BASE_URL}/api/agents/${AGENT_ID}`);
  if (!liveRes.ok) throw new Error(`Failed to fetch live agent: ${liveRes.status}`);
  const live = await liveRes.json();
  console.log('Live tools:', Object.keys(live.tools || {}).join(', '));

  // 2. Fetch the latest stored version to inherit model / instructions / etc.
  const versionsRes = await fetch(`${BASE_URL}/api/stored/agents/${AGENT_ID}/versions`);
  if (!versionsRes.ok) throw new Error(`Failed to fetch versions: ${versionsRes.status}`);
  const versionsData = await versionsRes.json();
  const latestVersion = versionsData.versions?.[0];
  if (!latestVersion) throw new Error('No stored versions found');
  console.log('Base version:', latestVersion.versionNumber, '| tools in DB:', Object.keys(latestVersion.tools || {}).join(', '));

  // 3. Build new tools payload from live agent (has all 5)
  const newTools = live.tools;

  // 4. POST new version
  const body = {
    name: latestVersion.name,
    instructions: latestVersion.instructions,
    model: latestVersion.model,
    tools: newTools,
    mcpClients: latestVersion.mcpClients ?? [],
    requestContextSchema: latestVersion.requestContextSchema ?? null,
    changeMessage: 'Synced 3 new Co-Pilot tools: listRepositoryAgents, createNewAgent, generateCanvasWorkflow',
  };

  console.log('\nPosting new version with tools:', Object.keys(newTools).join(', '));

  const postRes = await fetch(`${BASE_URL}/api/stored/agents/${AGENT_ID}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const postBody = await postRes.text();
  console.log(`\nPOST status: ${postRes.status}`);
  console.log('Response:', postBody.slice(0, 1000));

  if (postRes.ok) {
    const result = JSON.parse(postBody);
    console.log('\n✅ New version created:', result.versionNumber ?? result.id);
    console.log('Tools stored:', Object.keys(result.tools ?? {}).join(', '));
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
