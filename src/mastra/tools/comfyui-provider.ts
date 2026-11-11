import crypto from 'node:crypto';
import { saveImage } from './google-image-provider';

export const DEFAULT_COMFYUI_URL =
  process.env.COMFYUI_BASE_URL || process.env.COMFY_BASE_URL || 'http://127.0.0.1:8188';

export interface ComfyUIGenerationOptions {
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  negativePrompt?: string;
  baseUrl?: string;
}

/**
 * Checks if the local ComfyUI server is running and reachable.
 */
export async function isComfyUIAvailable(customBaseUrl?: string): Promise<boolean> {
  const baseUrl = (customBaseUrl || DEFAULT_COMFYUI_URL).replace(/\/+$/, '');
  try {
    const res = await fetch(`${baseUrl}/system_stats`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Inspects ComfyUI's available models to find matching loaded safetensors files.
 */
async function getComfyUIModelSelection(baseUrl: string): Promise<{
  unet: string;
  clip: string;
  vae: string;
}> {
  let unet = 'qwen_image_2.1_int8_convrot.safetensors';
  let clip = 'qwen3.5_9b_qwen_image_2.1_pe_t2i.int8_convrot.safetensors';
  let vae = 'qwen_image_2.1_vae_bf16.safetensors';

  try {
    const res = await fetch(`${baseUrl}/object_info`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = (await res.json()) as any;

      // Extract UNET / Diffusion models
      const unetList: string[] =
        data?.UNETLoader?.input?.required?.unet_name?.[0] ||
        data?.DiffusionModelLoader?.input?.required?.unet_name?.[0] ||
        [];
      const qwenUnet = unetList.find((m) => m.toLowerCase().includes('qwen') || m.toLowerCase().includes('2.1'));
      if (qwenUnet) unet = qwenUnet;
      else if (unetList.length > 0) unet = unetList[0];

      // Extract CLIP / Text Encoders
      const clipList: string[] =
        data?.CLIPLoader?.input?.required?.clip_name?.[0] ||
        data?.DualCLIPLoader?.input?.required?.clip_name1?.[0] ||
        [];
      const qwenClip = clipList.find((m) => m.toLowerCase().includes('qwen') || m.toLowerCase().includes('pe_t2i') || m.toLowerCase().includes('3vl'));
      if (qwenClip) clip = qwenClip;
      else if (clipList.length > 0) clip = clipList[0];

      // Extract VAE
      const vaeList: string[] = data?.VAELoader?.input?.required?.vae_name?.[0] || [];
      const qwenVae = vaeList.find((m) => m.toLowerCase().includes('qwen') || m.toLowerCase().includes('ae.safetensors'));
      if (qwenVae) vae = qwenVae;
      else if (vaeList.length > 0) vae = vaeList[0];
    }
  } catch {
    // Keep default Qwen 2.1 names
  }

  return { unet, clip, vae };
}

/**
 * Submits a prompt to local ComfyUI and polls until the generated image is available.
 */
export async function generateComfyUIImage(
  prompt: string,
  options: ComfyUIGenerationOptions = {}
): Promise<{ imageUrl: string; model: string; provider: string }> {
  const baseUrl = (options.baseUrl || DEFAULT_COMFYUI_URL).replace(/\/+$/, '');
  const clientId = `awas_${crypto.randomUUID().slice(0, 8)}`;
  const seed = options.seed ?? Math.floor(Math.random() * 1000000000);
  const width = options.width || 1024;
  const height = options.height || 1024;
  const steps = options.steps || 25;

  const { unet, clip, vae } = await getComfyUIModelSelection(baseUrl);

  // Standard API format graph for diffusion generation
  const workflowPrompt = {
    '1': {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: unet,
        weight_dtype: 'default',
      },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: clip,
        type: clip.toLowerCase().includes('qwen') ? 'qwen_image' : 'lumina2',
      },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: {
        vae_name: vae,
      },
    },
    '4': {
      class_type: 'EmptySD3LatentImage',
      inputs: {
        batch_size: 1,
        width,
        height,
      },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['2', 0],
        text: prompt,
      },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['2', 0],
        text: options.negativePrompt || 'blurry, low quality, distorted, bad anatomy',
      },
    },
    '7': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: {
        model: ['1', 0],
        shift: 3,
      },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        model: ['7', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['4', 0],
        seed,
        steps,
        cfg: 4.5,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1.0,
      },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['8', 0],
        vae: ['3', 0],
      },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'Qwen_AWAS',
        images: ['9', 0],
      },
    },
  };

  // 1. Submit prompt to ComfyUI
  const promptRes = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      prompt: workflowPrompt,
    }),
  });

  if (!promptRes.ok) {
    const errText = await promptRes.text();
    throw new Error(`ComfyUI rejected prompt execution: ${errText.slice(0, 300)}`);
  }

  const promptData = (await promptRes.json()) as any;
  const promptId = promptData?.prompt_id;
  if (!promptId) {
    throw new Error('ComfyUI did not return a prompt_id');
  }

  // 2. Poll for generation completion (up to 120 seconds)
  const maxAttempts = 120;
  let targetImageInfo: { filename: string; subfolder: string; type: string } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      const historyRes = await fetch(`${baseUrl}/history/${promptId}`);
      if (!historyRes.ok) continue;

      const historyData = (await historyRes.json()) as any;
      const execution = historyData?.[promptId];

      if (execution) {
        // Check if outputs exist
        const outputs = execution?.outputs;
        if (outputs) {
          for (const nodeId of Object.keys(outputs)) {
            const images = outputs[nodeId]?.images;
            if (Array.isArray(images) && images.length > 0) {
              targetImageInfo = images[0];
              break;
            }
          }
        }
        if (targetImageInfo) break;

        // Check if execution failed with error
        if (execution?.status?.status_str === 'error') {
          const errDetails = JSON.stringify(execution?.status?.messages || 'Execution error');
          throw new Error(`ComfyUI workflow failed: ${errDetails}`);
        }
      }
    } catch (pollErr: any) {
      if (pollErr?.message?.includes('ComfyUI workflow failed')) {
        throw pollErr;
      }
    }
  }

  if (!targetImageInfo) {
    throw new Error('Timed out waiting for ComfyUI to finish image synthesis');
  }

  // 3. Download the finished image from ComfyUI
  const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(targetImageInfo.filename)}&subfolder=${encodeURIComponent(
    targetImageInfo.subfolder || ''
  )}&type=${encodeURIComponent(targetImageInfo.type || 'output')}`;

  const imageRes = await fetch(viewUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to download image from ComfyUI: HTTP ${imageRes.status}`);
  }

  const arrayBuffer = await imageRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 4. Save to AWAS image serving directory
  const saved = saveImage(buffer, 'image/png');

  return {
    imageUrl: saved.url,
    model: `Qwen-Image 2.1 (${unet})`,
    provider: 'ComfyUI Local Desktop',
  };
}

