/**
 * providers/gemini.ts
 *
 * Google Gemini cloud provider helper.
 * Default model: 'google/gemini-2.0-flash'
 *
 * In Mastra framework, string models starting with 'google/' are resolved
 * natively via the Google Generative AI integration when GOOGLE_GENERATIVE_AI_API_KEY
 * or GEMINI_API_KEY is present in environment.
 */

export const DEFAULT_GEMINI_MODEL = 'google/gemini-3.8-flash';

/**
 * Normalizes model ID to canonical Google format.
 */
export function geminiModel(modelId?: string): string {
  if (!modelId) return DEFAULT_GEMINI_MODEL;
  let cleaned = modelId.replace(/^(google|gemini):/, '');
  if (cleaned.includes('gemini-2.5') || cleaned.includes('gemini-2.0') || cleaned === 'gemini-flash' || cleaned === 'default') {
    cleaned = 'gemini-3.8-flash';
  }
  return cleaned.startsWith('google/') ? cleaned : `google/${cleaned}`;
}

/**
 * Returns true if Google Gemini credentials are configured.
 */
export function hasGoogleCredentials(): boolean {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim() !== '' && !key.includes('your_') && !key.includes('your-'));
}
