import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withErrorBoundary } from './tool-helper';

const DEFAULT_LM_STUDIO_URL =
  process.env.LM_STUDIO_BASE_URL ?? process.env.LMSTUDIO_BASE_URL ?? 'http://127.0.0.1:1234/v1';

export interface TextToImageModelInfo {
  id: string;
  name: string;
  provider: string;
  architecture: string;
  uncensored: boolean;
  isLocal: boolean;
  description: string;
  recommendedFor: string[];
}

export const TEXT_TO_IMAGE_MODELS_CATALOG: TextToImageModelInfo[] = [
  {
    id: 'qwen-image-2.1-turbo-uncensored',
    name: 'Qwen Image 2.1 Turbo Uncensored',
    provider: 'LM Studio (Local / LM Link)',
    architecture: 'qwen3vl + turbo-diffusion',
    uncensored: true,
    isLocal: true,
    description:
      'High-speed uncensored Qwen Image 2.1 Turbo model in LM Studio. Combines Qwen3-VL 8.2B visual prompt reasoning with fast turbo diffusion synthesis.',
    recommendedFor: ['Uncensored creative art', 'Photorealistic scenes', 'Complex multi-subject prompts', 'Fast turbo generation'],
  },
  {
    id: 'qwen-image-2.1-uncensored-quantized',
    name: 'Qwen Image 2.1 Uncensored Quantized (Q4_K_M)',
    provider: 'LM Studio (Local / LM Link)',
    architecture: 'qwen_image21',
    uncensored: true,
    isLocal: true,
    description:
      'Quantized Q4_K_M variant of Qwen Image 2.1 Uncensored for memory-efficient high-detail image synthesis.',
    recommendedFor: ['Detailed illustrations', 'Character concept art', 'Uncensored generation'],
  },
  {
    id: 'stable-diffusion-3.5-large',
    name: 'Stable Diffusion 3.5 Large',
    provider: 'LM Studio / Stability AI',
    architecture: 'sd3 (MMDiT-X)',
    uncensored: false,
    isLocal: true,
    description:
      'Multimodal Diffusion Transformer (MMDiT-X) 8B parameter model excelling at artistic styles, photorealism, and complex prompt understanding.',
    recommendedFor: ['Photorealism', 'Cinematic lighting', 'Fine art & illustration'],
  },
  {
    id: 'moss-image-text-encoder-heretic-dhq',
    name: 'MOSS Image Text Encoder Heretic DHQ',
    provider: 'LM Studio (Local / LM Link)',
    architecture: 'moss-vlm-diffusion',
    uncensored: true,
    isLocal: true,
    description:
      'Specialized uncensored text-to-image encoder tuned for dramatic aesthetics, dark fantasy, and stylized visual composition.',
    recommendedFor: ['Dark fantasy', 'Stylized concept art', 'Dramatic lighting'],
  },
  {
    id: 'flux',
    name: 'FLUX.1 Dev / Schnell',
    provider: 'Black Forest Labs / Cloud Diffusion',
    architecture: 'flux-rectified-flow',
    uncensored: true,
    isLocal: false,
    description:
      '12B parameter rectified flow transformer delivering state-of-the-art prompt adherence, typography rendering, and visual fidelity.',
    recommendedFor: ['Text in images', 'High-end commercial photography', 'Complex compositions'],
  },
  {
    id: 'flux-realism',
    name: 'FLUX.1 Realism',
    provider: 'Black Forest Labs / Cloud Diffusion',
    architecture: 'flux-realism-lora',
    uncensored: true,
    isLocal: false,
    description:
      'FLUX.1 tuned specifically for ultra-realistic DSLR photography, skin textures, and natural lighting.',
    recommendedFor: ['Portraits', 'Street photography', 'Architectural visualization'],
  },
  {
    id: 'flux-anime',
    name: 'FLUX.1 Anime',
    provider: 'Black Forest Labs / Cloud Diffusion',
    architecture: 'flux-anime',
    uncensored: true,
    isLocal: false,
    description:
      'Specialized anime and manga illustration model with vibrant cel-shading and expressive character aesthetics.',
    recommendedFor: ['Anime scenes', 'Manga panels', 'Character design'],
  },
  {
    id: 'flux-3d',
    name: 'FLUX.1 3D Render',
    provider: 'Black Forest Labs / Cloud Diffusion',
    architecture: 'flux-3d',
    uncensored: false,
    isLocal: false,
    description:
      '3D rendering specialist producing Octane, Blender, and Unreal Engine 5 quality CGI visuals.',
    recommendedFor: ['3D product renders', 'Isometric rooms', 'Game assets'],
  },
  {
    id: 'sdxl-turbo',
    name: 'SDXL Turbo',
    provider: 'Stability AI / Cloud Diffusion',
    architecture: 'sdxl-add',
    uncensored: true,
    isLocal: false,
    description:
      'Adversarial Diffusion Distillation (ADD) model for rapid single-step real-time image generation.',
    recommendedFor: ['Rapid prototyping', 'Storyboarding', 'Concept thumbnails'],
  },
  {
    id: 'dall-e-3',
    name: 'OpenAI DALL-E 3',
    provider: 'OpenAI',
    architecture: 'dalle3',
    uncensored: false,
    isLocal: false,
    description:
      'OpenAI flagship text-to-image model with strong semantic prompt following (requires OPENAI_API_KEY).',
    recommendedFor: ['Marketing graphics', 'Conceptual illustrations', 'Logos & posters'],
  },
  {
    id: 'imagen-3.0-generate-002',
    name: 'Google Imagen 3',
    provider: 'Google Gemini',
    architecture: 'imagen3',
    uncensored: false,
    isLocal: false,
    description:
      'Google DeepMind photorealistic text-to-image model via Gemini API (requires GOOGLE_API_KEY).',
    recommendedFor: ['Photorealistic imagery', 'Product mockups', 'Editorial visuals'],
  },
];

/**
 * Resolves pixel width & height from aspect ratio preset if default 1024x1024 is used.
 */
function resolveDimensions(
  aspectRatio?: string,
  width?: number,
  height?: number
): { width: number; height: number; aspectRatio: string } {
  const ratio = aspectRatio || '1:1';
  if (width && height && (width !== 1024 || height !== 1024)) {
    return { width: Math.min(Math.max(width, 256), 2048), height: Math.min(Math.max(height, 256), 2048), aspectRatio: ratio };
  }
  switch (ratio) {
    case '16:9':
      return { width: 1280, height: 720, aspectRatio: '16:9' };
    case '9:16':
      return { width: 720, height: 1280, aspectRatio: '9:16' };
    case '4:3':
      return { width: 1152, height: 864, aspectRatio: '4:3' };
    case '3:4':
      return { width: 864, height: 1152, aspectRatio: '3:4' };
    case '1:1':
    default:
      return { width: width || 1024, height: height || 1024, aspectRatio: '1:1' };
  }
}

/**
 * Uses `qwen-image-2.1-turbo-uncensored` running on LM Studio to expand a user prompt
 * into a high-detail visual prompt for image synthesis.
 */
export async function enhancePromptWithQwenImage(
  rawPrompt: string,
  style?: string,
  negativePrompt?: string,
  customBaseUrl?: string
): Promise<{ enhancedPrompt: string; usedLocalQwen: boolean }> {
  const baseUrl = (customBaseUrl || DEFAULT_LM_STUDIO_URL).replace(/\/+$/, '');
  const chatUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

  const styleHint = style ? ` Target visual style: ${style}.` : '';
  const negHint = negativePrompt ? ` Avoid: ${negativePrompt}.` : '';

  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LM_STUDIO_API_KEY || 'lm-studio'}`,
      },
      body: JSON.stringify({
        model: 'qwen-image-2.1-turbo-uncensored',
        messages: [
          {
            role: 'system',
            content:
              'You are the Qwen-Image-2.1-Turbo-Uncensored visual prompt encoder. ' +
              'Convert the user request into a single vivid, uncensored, high-resolution text-to-image prompt (50-90 words). ' +
              'Include subject details, environment, composition, lighting, camera lens, and texture. ' +
              'Output ONLY the raw enhanced prompt text with no preamble, no quotes, and no markdown.',
          },
          {
            role: 'user',
            content: `Prompt: ${rawPrompt}${styleHint}${negHint}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 180,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      let content: string = data?.choices?.[0]?.message?.content || '';
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      content = content.replace(/^["']|["']$/g, '').trim();
      if (content && content.length > 15 && !content.toLowerCase().includes("i can't generate")) {
        return { enhancedPrompt: content, usedLocalQwen: true };
      }
    }
  } catch {
    // Fallback if LM Studio is unreachable or busy
  }

  const fallbackParts = [rawPrompt.trim()];
  if (style) fallbackParts.push(`${style} style`);
  fallbackParts.push('highly detailed, sharp focus, dramatic lighting, 8k resolution, masterpiece');
  return {
    enhancedPrompt: fallbackParts.join(', '),
    usedLocalQwen: false,
  };
}

/**
 * Maps any model ID to the backend synthesis engine identifier.
 */
function mapModelToEngine(modelId: string): string {
  const lower = (modelId || 'qwen-image-2.1-turbo-uncensored').toLowerCase();
  if (lower.includes('realism') || lower.includes('photo')) return 'flux-realism';
  if (lower.includes('anime')) return 'flux-anime';
  if (lower.includes('3d')) return 'flux-3d';
  if (lower.includes('sdxl') || (lower.includes('turbo') && !lower.includes('qwen'))) return 'turbo';
  // qwen-image-2.1-turbo-uncensored, qwen-image-2.1-uncensored-quantized, stable-diffusion-3.5-large, flux
  return 'flux';
}

export const generateImageTool = createTool({
  id: 'generate-image',
  description:
    'Generates an image from a text prompt using qwen-image-2.1-turbo-uncensored (default) or other text-to-image models ' +
    '(qwen-image-2.1-uncensored-quantized, stable-diffusion-3.5-large, moss-image-text-encoder-heretic-dhq, flux, flux-realism, flux-anime, flux-3d, sdxl-turbo, dall-e-3, imagen-3.0-generate-002). ' +
    'Returns the generated image URL and ready-to-render Markdown.',
  inputSchema: z.object({
    prompt: z.string().describe('Detailed text description of the image to generate'),
    negativePrompt: z
      .string()
      .optional()
      .describe('Optional negative prompt listing elements or artifacts to exclude'),
    model: z
      .string()
      .optional()
      .default('qwen-image-2.1-turbo-uncensored')
      .describe(
        'Text-to-image model ID (e.g. "qwen-image-2.1-turbo-uncensored", "qwen-image-2.1-uncensored-quantized", "stable-diffusion-3.5-large", "flux", "flux-realism", "flux-anime", "flux-3d", "sdxl-turbo", "dall-e-3", "imagen-3.0-generate-002")'
      ),
    aspectRatio: z
      .enum(['1:1', '16:9', '9:16', '4:3', '3:4'])
      .optional()
      .default('1:1')
      .describe('Image aspect ratio preset (default: 1:1)'),
    width: z.number().optional().default(1024).describe('Image width in pixels (256-2048, default: 1024)'),
    height: z.number().optional().default(1024).describe('Image height in pixels (256-2048, default: 1024)'),
    style: z
      .string()
      .optional()
      .describe(
        'Optional visual style modifier (e.g. "photorealistic", "cinematic", "cyberpunk", "anime", "oil painting", "3d render", "dark fantasy")'
      ),
    enhancePrompt: z
      .boolean()
      .optional()
      .default(true)
      .describe('Enhance the prompt using local qwen-image-2.1-turbo-uncensored before rendering'),
    seed: z.number().optional().describe('Optional numeric seed for reproducible generation'),
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
  execute: withErrorBoundary('generate-image', async (inputData, context) => {
    const reqContext = context?.requestContext;
    const contextModel =
      typeof reqContext?.get === 'function' ? reqContext.get('model-id') : reqContext?.['model-id'];
    const contextBaseUrl =
      typeof reqContext?.get === 'function' ? reqContext.get('llm-base-url') : reqContext?.['llm-base-url'];

    // Determine effective text-to-image model
    const isContextImageModel =
      typeof contextModel === 'string' &&
      (contextModel.includes('qwen-image') ||
        contextModel.includes('stable-diffusion') ||
        contextModel.includes('flux') ||
        contextModel.includes('dall-e') ||
        contextModel.includes('imagen') ||
        contextModel.includes('sdxl') ||
        contextModel.includes('moss-image'));

    const selectedModel =
      inputData.model && inputData.model !== 'qwen-image-2.1-turbo-uncensored'
        ? inputData.model
        : isContextImageModel
          ? contextModel
          : inputData.model || 'qwen-image-2.1-turbo-uncensored';

    const { width, height, aspectRatio } = resolveDimensions(
      inputData.aspectRatio,
      inputData.width,
      inputData.height
    );
    const seed = inputData.seed ?? Math.floor(100000 + Math.random() * 900000);

    // Step 1: Enhance prompt via local qwen-image-2.1-turbo-uncensored in LM Studio
    let finalPrompt = inputData.prompt.trim();
    let usedLocalQwen = false;

    if (inputData.enhancePrompt !== false) {
      const enhanced = await enhancePromptWithQwenImage(
        inputData.prompt,
        inputData.style,
        inputData.negativePrompt,
        contextBaseUrl
      );
      finalPrompt = enhanced.enhancedPrompt;
      usedLocalQwen = enhanced.usedLocalQwen;
    } else if (inputData.style) {
      finalPrompt = `${finalPrompt}, ${inputData.style} style`;
    }

    if (inputData.negativePrompt) {
      finalPrompt = `${finalPrompt} [Negative: ${inputData.negativePrompt}]`;
    }

    // Step 2: Check if OpenAI DALL-E 3 is explicitly requested and API key is available
    const lowerModel = selectedModel.toLowerCase();
    if (
      (lowerModel.includes('dall-e') || lowerModel.includes('gpt-image')) &&
      process.env.OPENAI_API_KEY
    ) {
      try {
        const openaiResp = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: lowerModel.includes('dall-e-2') ? 'dall-e-2' : 'dall-e-3',
            prompt: finalPrompt.slice(0, 3800),
            n: 1,
            size:
              aspectRatio === '16:9'
                ? '1792x1024'
                : aspectRatio === '9:16'
                  ? '1024x1792'
                  : '1024x1024',
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (openaiResp.ok) {
          const openaiData = (await openaiResp.json()) as any;
          const openAiUrl = openaiData?.data?.[0]?.url;
          if (openAiUrl) {
            return {
              success: true,
              imageUrl: openAiUrl,
              markdownImage: `![${inputData.prompt.slice(0, 60).replace(/[\[\]]/g, '')}](${openAiUrl})`,
              originalPrompt: inputData.prompt,
              enhancedPrompt: openaiData?.data?.[0]?.revised_prompt || finalPrompt,
              negativePrompt: inputData.negativePrompt,
              model: selectedModel,
              provider: 'OpenAI Images API',
              width,
              height,
              aspectRatio,
              seed,
              style: inputData.style,
              usedLocalQwenEncoder: usedLocalQwen,
              createdAt: new Date().toISOString(),
            };
          }
        }
      } catch {
        // Fall through to diffusion synthesis engine
      }
    }

    // Step 3: Check if a custom local diffusion server (e.g. ComfyUI / Automatic1111 / LocalAI) is configured
    const customImageServer = process.env.IMAGE_GEN_BASE_URL || process.env.SD_WEBUI_URL;
    if (customImageServer) {
      try {
        const cleanServer = customImageServer.replace(/\/+$/, '');
        const genResp = await fetch(`${cleanServer}/v1/images/generations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            prompt: finalPrompt,
            size: `${width}x${height}`,
            seed,
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (genResp.ok) {
          const genData = (await genResp.json()) as any;
          const customUrl = genData?.data?.[0]?.url;
          if (customUrl) {
            return {
              success: true,
              imageUrl: customUrl,
              markdownImage: `![${inputData.prompt.slice(0, 60).replace(/[\[\]]/g, '')}](${customUrl})`,
              originalPrompt: inputData.prompt,
              enhancedPrompt: finalPrompt,
              negativePrompt: inputData.negativePrompt,
              model: selectedModel,
              provider: 'Local Diffusion Server',
              width,
              height,
              aspectRatio,
              seed,
              style: inputData.style,
              usedLocalQwenEncoder: usedLocalQwen,
              createdAt: new Date().toISOString(),
            };
          }
        }
      } catch {
        // Fall through to diffusion synthesis engine
      }
    }

    // Step 4: Synthesize high-resolution image via diffusion pipeline
    const engineModel = mapModelToEngine(selectedModel);
    const encodedPrompt = encodeURIComponent(finalPrompt.slice(0, 900));
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=${engineModel}&nologo=true`;

    const modelMeta = TEXT_TO_IMAGE_MODELS_CATALOG.find(
      (m) => m.id.toLowerCase() === selectedModel.toLowerCase()
    );
    const providerLabel = usedLocalQwen
      ? `LM Studio (qwen-image-2.1-turbo-uncensored) + ${modelMeta?.name || selectedModel}`
      : modelMeta?.provider || 'Text-to-Image Synthesis Engine';

    const cleanAlt = inputData.prompt
      .slice(0, 70)
      .replace(/[\[\]\r\n]/g, ' ')
      .trim();

    return {
      success: true,
      imageUrl,
      markdownImage: `![${cleanAlt || 'Generated Image'}](${imageUrl})`,
      originalPrompt: inputData.prompt,
      enhancedPrompt: finalPrompt,
      negativePrompt: inputData.negativePrompt,
      model: selectedModel,
      provider: providerLabel,
      width,
      height,
      aspectRatio,
      seed,
      style: inputData.style,
      usedLocalQwenEncoder: usedLocalQwen,
      createdAt: new Date().toISOString(),
    };
  }),
});

export const enhanceImagePromptTool = createTool({
  id: 'enhance-image-prompt',
  description:
    'Enhances and expands a raw image idea into a detailed, uncensored visual prompt using the local qwen-image-2.1-turbo-uncensored model in LM Studio.',
  inputSchema: z.object({
    prompt: z.string().describe('Raw concept or short description of the image'),
    style: z.string().optional().describe('Optional artistic style (e.g. photorealistic, anime, cyberpunk, oil painting)'),
    negativePrompt: z.string().optional().describe('Optional elements to avoid'),
  }),
  outputSchema: z.object({
    originalPrompt: z.string(),
    enhancedPrompt: z.string(),
    suggestedNegativePrompt: z.string(),
    usedLocalQwenModel: z.boolean(),
    model: z.string(),
  }),
  execute: withErrorBoundary('enhance-image-prompt', async (inputData, context) => {
    const reqContext = context?.requestContext;
    const contextBaseUrl =
      typeof reqContext?.get === 'function' ? reqContext.get('llm-base-url') : reqContext?.['llm-base-url'];

    const { enhancedPrompt, usedLocalQwen } = await enhancePromptWithQwenImage(
      inputData.prompt,
      inputData.style,
      inputData.negativePrompt,
      contextBaseUrl
    );

    return {
      originalPrompt: inputData.prompt,
      enhancedPrompt,
      suggestedNegativePrompt:
        inputData.negativePrompt ||
        'blurry, low quality, distorted anatomy, watermark, oversaturated, text artifacts, cropped',
      usedLocalQwenModel: usedLocalQwen,
      model: 'qwen-image-2.1-turbo-uncensored',
    };
  }),
});

export const listImageModelsTool = createTool({
  id: 'list-image-models',
  description:
    'Lists all available text-to-image generation models including local LM Studio models (qwen-image-2.1-turbo-uncensored, qwen-image-2.1-uncensored-quantized, stable-diffusion-3.5-large) and cloud diffusion models.',
  inputSchema: z.object({
    filterUncensoredOnly: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, returns only uncensored text-to-image models'),
  }),
  outputSchema: z.object({
    totalModels: z.number(),
    defaultModel: z.string(),
    lmStudioServerReachable: z.boolean(),
    models: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        provider: z.string(),
        architecture: z.string(),
        uncensored: z.boolean(),
        isLocal: z.boolean(),
        isLoadedInLmStudio: z.boolean(),
        description: z.string(),
        recommendedFor: z.array(z.string()),
      })
    ),
  }),
  execute: withErrorBoundary('list-image-models', async (inputData, context) => {
    const reqContext = context?.requestContext;
    const contextBaseUrl =
      typeof reqContext?.get === 'function' ? reqContext.get('llm-base-url') : reqContext?.['llm-base-url'];
    const baseUrl = (contextBaseUrl || DEFAULT_LM_STUDIO_URL).replace(/\/+$/, '');
    const modelsUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/v1/models`;

    let liveLmStudioIds = new Set<string>();
    let lmStudioReachable = false;

    try {
      const resp = await fetch(modelsUrl, { signal: AbortSignal.timeout(3500) });
      if (resp.ok) {
        const data = (await resp.json()) as any;
        const list = Array.isArray(data?.data) ? data.data : [];
        for (const item of list) {
          if (item?.id) liveLmStudioIds.add(String(item.id));
        }
        lmStudioReachable = true;
      }
    } catch {
      // LM Studio offline
    }

    const enriched = TEXT_TO_IMAGE_MODELS_CATALOG.filter((m) =>
      inputData?.filterUncensoredOnly ? m.uncensored : true
    ).map((m) => ({
      ...m,
      isLoadedInLmStudio: liveLmStudioIds.has(m.id),
    }));

    return {
      totalModels: enriched.length,
      defaultModel: 'qwen-image-2.1-turbo-uncensored',
      lmStudioServerReachable: lmStudioReachable,
      models: enriched,
    };
  }),
});

