import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema } from '../context';
import {
  generateImageTool,
  enhancePromptWithQwenImage,
} from '../tools/image-generation-tool';

const prepareAndEnhancePromptStep = createStep({
  id: 'prepare-and-enhance-prompt',
  description: 'Validates input, expands concepts, and optimizes prompts using Qwen Image 2.1 Turbo Uncensored visual prompt encoder.',
  inputSchema: z.object({
    prompt: z.string().describe('Detailed concept or description of the image'),
    style: z.string().optional().describe('Artistic style (photorealistic, anime, cyberpunk, 3d, dark fantasy, etc.)'),
    negativePrompt: z.string().optional().describe('Elements to avoid in the generation'),
    model: z.string().optional().default('qwen-image-2.1-turbo-uncensored').describe('Text-to-image model ID'),
    aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional().default('1:1'),
    enhancePrompt: z.boolean().optional().default(true),
    seed: z.number().optional(),
  }),
  outputSchema: z.object({
    originalPrompt: z.string(),
    enhancedPrompt: z.string(),
    style: z.string().optional(),
    negativePrompt: z.string().optional(),
    model: z.string(),
    aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']),
    seed: z.number(),
    usedLocalQwen: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('inputData missing');

    const seed = inputData.seed ?? Math.floor(100000 + Math.random() * 900000);
    const model = inputData.model || 'qwen-image-2.1-turbo-uncensored';
    const aspectRatio = inputData.aspectRatio || '1:1';

    let enhancedPrompt = inputData.prompt.trim();
    let usedLocalQwen = false;

    if (inputData.enhancePrompt !== false) {
      const res = await enhancePromptWithQwenImage(
        inputData.prompt,
        inputData.style,
        inputData.negativePrompt
      );
      enhancedPrompt = res.enhancedPrompt;
      usedLocalQwen = res.usedLocalQwen;
    } else if (inputData.style) {
      enhancedPrompt = `${enhancedPrompt}, ${inputData.style} style`;
    }

    return {
      originalPrompt: inputData.prompt,
      enhancedPrompt,
      style: inputData.style,
      negativePrompt: inputData.negativePrompt,
      model,
      aspectRatio,
      seed,
      usedLocalQwen,
    };
  },
});

const synthesizeImageStep = createStep({
  id: 'synthesize-image',
  description: 'Generates image using qwen-image-2.1-turbo-uncensored or selected text-to-image model via generateImageTool.',
  inputSchema: z.object({
    originalPrompt: z.string(),
    enhancedPrompt: z.string(),
    style: z.string().optional(),
    negativePrompt: z.string().optional(),
    model: z.string(),
    aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']),
    seed: z.number(),
    usedLocalQwen: z.boolean(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    imageUrl: z.string(),
    markdownImage: z.string(),
    originalPrompt: z.string(),
    enhancedPrompt: z.string(),
    negativePrompt: z.string().optional(),
    model: z.string(),
    provider: z.string(),
    width: z.number(),
    height: z.number(),
    aspectRatio: z.string(),
    seed: z.number(),
    style: z.string().optional(),
    usedLocalQwenEncoder: z.boolean(),
    createdAt: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('inputData missing');

    const toolResult: any = await (generateImageTool as any).execute({
      prompt: inputData.originalPrompt,
      model: inputData.model,
      aspectRatio: inputData.aspectRatio,
      width: 1024,
      height: 1024,
      style: inputData.style,
      negativePrompt: inputData.negativePrompt,
      enhancePrompt: false, // Already enhanced in step 1
      seed: inputData.seed,
    });

    return {
      success: Boolean(toolResult?.success),
      imageUrl: String(toolResult?.imageUrl || ''),
      markdownImage: String(toolResult?.markdownImage || ''),
      originalPrompt: inputData.originalPrompt,
      enhancedPrompt: inputData.enhancedPrompt,
      negativePrompt: inputData.negativePrompt,
      model: inputData.model,
      provider: String(toolResult?.provider || 'Text-to-Image Synthesis Engine'),
      width: Number(toolResult?.width || 1024),
      height: Number(toolResult?.height || 1024),
      aspectRatio: inputData.aspectRatio,
      seed: inputData.seed,
      style: inputData.style,
      usedLocalQwenEncoder: Boolean(inputData.usedLocalQwen || toolResult?.usedLocalQwenEncoder),
      createdAt: String(toolResult?.createdAt || new Date().toISOString()),
    };
  },
});

export const imageGenerationWorkflow = createWorkflow({
  id: 'image-generation-workflow',
  description:
    'Two-stage visual synthesis pipeline: optimizes prompt using local Qwen Image 2.1 Turbo Uncensored visual encoder, then generates high-resolution imagery across selected text-to-image models.',
  requestContextSchema,
  inputSchema: z.object({
    prompt: z.string().describe('Detailed prompt or visual concept'),
    style: z.string().optional().describe('Artistic style (photorealistic, cinematic, anime, cyberpunk, 3d, dark fantasy)'),
    negativePrompt: z.string().optional().describe('Negative prompt elements to exclude'),
    model: z.string().optional().default('qwen-image-2.1-turbo-uncensored').describe('Text-to-image model ID'),
    aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional().default('1:1'),
    enhancePrompt: z.boolean().optional().default(true),
    seed: z.number().optional().describe('Numeric seed for reproducible generation'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    imageUrl: z.string(),
    markdownImage: z.string(),
    originalPrompt: z.string(),
    enhancedPrompt: z.string(),
    negativePrompt: z.string().optional(),
    model: z.string(),
    provider: z.string(),
    width: z.number(),
    height: z.number(),
    aspectRatio: z.string(),
    seed: z.number(),
    style: z.string().optional(),
    usedLocalQwenEncoder: z.boolean(),
    createdAt: z.string(),
  }),
})
  .then(prepareAndEnhancePromptStep)
  .then(synthesizeImageStep);
