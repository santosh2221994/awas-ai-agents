import { Agent } from '@mastra/core/agent';
import { codeWorkspace } from '../workspace';
import { browser } from '../browsers';
import { TokenLimiter, EnsureFinalResponseProcessor, UsageTrackerProcessor } from '../processors';
import { lmStudioModel } from '../providers/lm-studio';
import { defaultMemory } from '../memory';
import { lightScorerConfig } from '../providers/model-helpers';
import { defaultTracingPolicy } from '../observability';

const BROWSER_MAX_STEPS = 15;

export const browserAgent = new Agent({
  id: 'browser-agent',
  name: 'Browser Agent',
  description: 'A real-browser web automation assistant powered by Playwright/Chromium.',
  workspace: codeWorkspace,
  model: () => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key || key === 'your-google-api-key') {
      return lmStudioModel();
    }
    return 'google/gemini-2.0-flash';
  },
  memory: defaultMemory,
  browser,
  instructions: `You are a web automation assistant with full control of a real Chromium browser.

You can navigate any website, fill forms, click buttons, and extract data.

## Capabilities
- Navigate to any URL
- Click buttons, links, and interactive elements
- Fill forms and submit them
- Read and extract page content and structured data
- Take screenshots to verify actions
- Handle multi-step web workflows (login → action → confirm)
- Wait for dynamic content to load

## How to work
1. Navigate to the target URL
2. Read the page content to understand the layout
3. Interact with elements step by step
4. Take a screenshot to verify each major action
5. Report results with specific data extracted from the page

## Best practices
- Always verify navigation succeeded before interacting
- Use getPageContent() to understand available elements
- Take screenshots at key steps so the user can see progress
- If a step fails, try an alternative selector or approach
- Report extracted data in a structured format (tables, lists)

Always cite the URLs you visited and describe what you found on each page.`,
  inputProcessors: [
    // Keep the full page content from overflowing the context window
    new TokenLimiter(100_000),
    // On the final step, disable tools and produce a clean summary
    new EnsureFinalResponseProcessor(BROWSER_MAX_STEPS),
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
