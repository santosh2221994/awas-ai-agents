import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Google image generation provider.
 *
 * Supports two Google API families with the same API key (GOOGLE_API_KEY):
 *  - Imagen (`models/imagen-*:predict`)
 *  - Gemini native image models / "Nano Banana" (`models/gemini-*-image:generateContent`)
 *
 * Generated images are persisted to disk and served by the Mastra server at
 * `/api/generated-images/<file>` so tool results stay small (no base64 in LLM context).
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Ordered fallback list of Google image models tried when no explicit model works. */
export const DEFAULT_GOOGLE_IMAGE_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-3-pro-image',
  'imagen-4.0-generate-001',
  'imagen-3.0-generate-002',
];

export const GENERATED_IMAGES_ROUTE = '/api/generated-images';

export function getGeneratedImagesDir(): string {
  const dir = process.env.GENERATED_IMAGES_DIR || path.join(os.tmpdir(), 'awas-generated-images');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getGoogleApiKey(): string | undefined {
  return (
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    undefined
  )?.trim() || undefined;
}

function getPublicBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL || process.env.MASTRA_PUBLIC_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const host = process.env.HOST && process.env.HOST !== '0.0.0.0' ? process.env.HOST : '127.0.0.1';
  const port = Number(process.env.PORT) || 4111;
  return `http://${host}:${port}`;
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function saveImage(base64: string, mimeType: string): { fileName: string; url: string } {
  const ext = MIME_EXT[mimeType] || 'png';
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(getGeneratedImagesDir(), fileName), Buffer.from(base64, 'base64'));
  return { fileName, url: `${getPublicBaseUrl()}${GENERATED_IMAGES_ROUTE}/${fileName}` };
}

/** Reads a previously generated image. Returns null for unknown/unsafe names. */
export function readGeneratedImage(fileName: string): { data: Buffer; mimeType: string } | null {
  if (!/^[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp)$/.test(fileName)) return null;
  const filePath = path.join(getGeneratedImagesDir(), fileName);
  if (!fs.existsSync(filePath)) return null;
  const ext = fileName.split('.').pop()!.toLowerCase();
  return { data: fs.readFileSync(filePath), mimeType: EXT_MIME[ext] || 'image/png' };
}

function describeGoogleError(status: number, body: string): string {
  let message = body.slice(0, 300);
  try {
    message = JSON.parse(body)?.error?.message || message;
    message = String(message).split(/\r?\n/)[0].slice(0, 250);
  } catch {
    /* keep raw body */
  }
  if (status === 429) {
    return `quota exceeded (429) — image generation is not enabled for this Google project. Enable billing / image quota at https://aistudio.google.com. Details: ${message}`;
  }
  if (status === 401 || status === 403) return `API key rejected (${status}): ${message}`;
  if (status === 404) return `model not available for this API key (404)`;
  return `HTTP ${status}: ${message}`;
}

async function callImagen(model: string, prompt: string, aspectRatio: string, apiKey: string) {
  const resp = await fetch(`${GEMINI_API_BASE}/models/${model}:predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio },
    }),
    signal: AbortSignal.timeout(90000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(describeGoogleError(resp.status, text));
  const data = JSON.parse(text);
  const pred = data?.predictions?.[0];
  if (!pred?.bytesBase64Encoded) {
    throw new Error(`no image returned${pred?.raiFilteredReason ? ` (safety filter: ${pred.raiFilteredReason})` : ''}`);
  }
  return { base64: pred.bytesBase64Encoded as string, mimeType: (pred.mimeType as string) || 'image/png', revisedPrompt: undefined as string | undefined };
}

async function callGeminiImage(model: string, prompt: string, aspectRatio: string, apiKey: string) {
  const resp = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: { aspectRatio },
      },
    }),
    signal: AbortSignal.timeout(90000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(describeGoogleError(resp.status, text));
  const data = JSON.parse(text);
  const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p?.inlineData?.data || p?.inline_data?.data);
  if (!imagePart) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    throw new Error(`no image returned${reason ? ` (reason: ${reason})` : ''}`);
  }
  const inline = imagePart.inlineData || imagePart.inline_data;
  const revisedPrompt = parts.filter((p) => typeof p?.text === 'string').map((p) => p.text).join(' ').trim() || undefined;
  return { base64: inline.data as string, mimeType: (inline.mimeType || inline.mime_type || 'image/png') as string, revisedPrompt };
}

export interface GoogleImageResult {
  imageUrl: string;
  fileName: string;
  model: string;
  mimeType: string;
  revisedPrompt?: string;
}

/**
 * Generates an image with Google. Tries the preferred model first (if it is a Google model),
 * then GOOGLE_IMAGE_MODEL, then DEFAULT_GOOGLE_IMAGE_MODELS. Throws a descriptive error
 * listing every attempt if all fail. Never falls back to non-Google providers.
 */
export async function generateGoogleImage(
  prompt: string,
  aspectRatio: string,
  preferredModel?: string
): Promise<GoogleImageResult> {
  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    throw new Error('Image generation failed: GOOGLE_API_KEY is not set in awas-ai-agents/.env.');
  }

  const isGoogleModel = (m?: string) => !!m && /^(imagen|gemini|nano-banana)/i.test(m);
  const candidates = [
    ...(isGoogleModel(preferredModel) ? [preferredModel!] : []),
    ...(process.env.GOOGLE_IMAGE_MODEL ? process.env.GOOGLE_IMAGE_MODEL.split(',').map((s) => s.trim()) : []),
    ...DEFAULT_GOOGLE_IMAGE_MODELS,
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);

  const failures: string[] = [];
  for (const model of candidates) {
    try {
      const out = /^imagen/i.test(model)
        ? await callImagen(model, prompt, aspectRatio, apiKey)
        : await callGeminiImage(model, prompt, aspectRatio, apiKey);
      const saved = saveImage(out.base64, out.mimeType);
      return { imageUrl: saved.url, fileName: saved.fileName, model, mimeType: out.mimeType, revisedPrompt: out.revisedPrompt };
    } catch (err: any) {
      const msg = err?.name === 'TimeoutError' ? 'timed out' : err?.message || String(err);
      failures.push(`${model}: ${msg}`);
      console.warn(`[google-image] ${model} failed: ${msg}`);
    }
  }

  throw new Error(`Google image generation failed for all models.\n- ${failures.join('\n- ')}`);
}
