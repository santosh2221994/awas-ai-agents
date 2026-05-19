/**
 * processors/regex-pii-redactor.ts
 *
 * Lightweight, zero-latency PII redaction using regex patterns.
 * Runs as an INPUT processor — scrubs sensitive values before they
 * reach the LLM so they are never logged or sent to the model API.
 *
 * Patterns covered (all opt-in via the `categories` config):
 *   email        — user@example.com  → [EMAIL REDACTED]
 *   phone        — +1-800-555-1234   → [PHONE REDACTED]
 *   creditCard   — 4111 1111 1111 1111 → [CREDIT CARD REDACTED]
 *   ssn          — 123-45-6789       → [SSN REDACTED]
 *   ipAddress    — 192.168.1.100     → [IP ADDRESS REDACTED]
 *   apiKey       — sk-… / ghp_…      → [API KEY REDACTED]
 *
 * Usage:
 *   new RegexPIIRedactor()                        // all categories on
 *   new RegexPIIRedactor({ email: false })        // disable email
 */

import type { Processor, ProcessInputArgs } from '@mastra/core/processors';
import type { MastraDBMessage } from '@mastra/core/memory';

export interface RegexPIIRedactorOptions {
  email?: boolean;
  phone?: boolean;
  creditCard?: boolean;
  ssn?: boolean;
  ipAddress?: boolean;
  apiKey?: boolean;
}

const PATTERNS: Record<keyof RegexPIIRedactorOptions, { re: RegExp; label: string }> = {
  email: {
    re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    label: '[EMAIL REDACTED]',
  },
  phone: {
    re: /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g,
    label: '[PHONE REDACTED]',
  },
  creditCard: {
    re: /\b(?:\d[ -]?){13,16}\b/g,
    label: '[CREDIT CARD REDACTED]',
  },
  ssn: {
    re: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    label: '[SSN REDACTED]',
  },
  ipAddress: {
    re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    label: '[IP ADDRESS REDACTED]',
  },
  apiKey: {
    // Common secret key prefixes: sk-, pk-, ghp_, ghs_, xoxb-, etc.
    re: /\b(?:sk|pk|ghp|ghs|xoxb|xoxa|xoxp|AIza|SG\.|AC[a-f0-9]{32}|[A-Za-z0-9]{20,}[-_][A-Za-z0-9]{20,})\S{8,}/g,
    label: '[API KEY REDACTED]',
  },
};

function redactText(text: string, active: RegexPIIRedactorOptions): string {
  let result = text;
  for (const [category, { re, label }] of Object.entries(PATTERNS) as [
    keyof RegexPIIRedactorOptions,
    { re: RegExp; label: string },
  ][]) {
    if (active[category] !== false) {
      result = result.replace(re, label);
    }
  }
  return result;
}

export class RegexPIIRedactor implements Processor {
  readonly id = 'regex-pii-redactor';
  private options: RegexPIIRedactorOptions;

  constructor(options: RegexPIIRedactorOptions = {}) {
    this.options = options;
  }

  async processInput({ messages }: ProcessInputArgs): Promise<MastraDBMessage[]> {
    return messages.map(msg => {
      if (msg.role !== 'user') return msg;

      const redactedParts = msg.content.parts?.map(part => {
        if (part.type !== 'text') return part;
        return { ...part, text: redactText(part.text, this.options) };
      });

      return {
        ...msg,
        content: {
          ...msg.content,
          parts: redactedParts,
        },
      };
    });
  }
}
