/**
 * browsers/index.ts
 *
 * Shared AgentBrowser instance for Mastra agents.
 *
 * AgentBrowser wraps Playwright and gives agents these tools automatically:
 *   navigate, click, type, getPageContent, screenshot, evaluate,
 *   getPageTitle, goBack, goForward, hover, select, waitForSelector
 *
 * Screencast streams a live JPEG feed to Mastra Studio's browser panel.
 * It is always enabled when the `screencast` key is present in the config.
 *
 * Environment variables:
 *   BROWSER_HEADLESS=true    — run headless (default: false = visible window)
 *   BROWSER_CDP_URL=wss://…  — connect to remote Chrome instead of local
 */

import { AgentBrowser } from '@mastra/agent-browser';

const headless = process.env.BROWSER_HEADLESS === 'true';
const cdpUrl   = process.env.BROWSER_CDP_URL;

export const browser = new AgentBrowser(
  cdpUrl
    ? // ── Remote CDP (Browserbase, Bright Data, etc.) ──────────────────────
      { cdpUrl, headless: true }
    : // ── Local Chromium via Playwright ────────────────────────────────────
      {
        headless,
        // screencast: present → Studio streams live video; omit fields to use defaults.
        // format defaults to 'jpeg', quality to 80, maxWidth to 1280, maxHeight to 720.
        screencast: {
          format:    'jpeg',
          quality:   80,
          maxWidth:  1280,
          maxHeight: 720,
        },
      }
);
