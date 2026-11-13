import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { requestContextSchema, commitNamedWorkflow } from '../context';

const generationTypeEnum = z.enum([
  'storyboard',
  'story',
  'image-prompt',
  'video-prompt',
  'content',
]);

const workflowInputSchema = z.object({
  idea: z.string().describe('Core user idea, story premise, visual concept, or content brief'),
  generationType: generationTypeEnum
    .optional()
    .default('storyboard')
    .describe('Type of creative output: storyboard, story, image-prompt, video-prompt, or content'),
  genre: z
    .string()
    .optional()
    .describe('Genre (e.g., fantasy, thriller, comedy, horror, sci-fi, drama, adventure)'),
  visualStyle: z
    .string()
    .optional()
    .describe('Visual style (e.g., realistic, cinematic, anime, cartoon, 3D, illustration)'),
  sceneCount: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe('Number of scenes to generate for storyboards (default: 5)'),
  tone: z.string().optional().describe('Tone or mood (e.g., dark, uplifting, suspenseful, witty)'),
  targetAudience: z.string().optional().describe('Target audience for stories or marketing content'),
  feedback: z
    .string()
    .optional()
    .describe('Optional revision notes or user feedback to refine or regenerate the output'),
});

const storyboardSceneSchema = z.object({
  sceneNumber: z.number(),
  sceneDescription: z.string(),
  characters: z.string(),
  cameraAngle: z.string(),
  lighting: z.string(),
  actions: z.string(),
  imageGenerationPrompt: z.string(),
  videoAnimationPrompt: z.string(),
  durationSeconds: z.number().optional(),
  transition: z.string().optional(),
});

const workflowOutputSchema = z.object({
  title: z.string(),
  generationType: generationTypeEnum,
  genre: z.string().optional(),
  visualStyle: z.string().optional(),
  characterConsistencyGuide: z.array(
    z.object({
      name: z.string(),
      appearance: z.string(),
      role: z.string(),
    }),
  ),
  scenes: z.array(storyboardSceneSchema),
  formattedOutput: z.string(),
  rawDraft: z.string(),
});

const analyzeAndDevelopConceptStep = createStep({
  id: 'analyze-and-develop-concept',
  description:
    'Analyzes the user idea, establishes character consistency, narrative arc, and visual direction.',
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    idea: z.string(),
    generationType: generationTypeEnum,
    genre: z.string().optional(),
    visualStyle: z.string().optional(),
    sceneCount: z.number(),
    tone: z.string().optional(),
    targetAudience: z.string().optional(),
    feedback: z.string().optional(),
    conceptBrief: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const generationType = inputData.generationType ?? 'storyboard';
    const sceneCount = inputData.sceneCount ?? 5;
    const agent = mastra?.getAgent('creative-generator-agent');

    if (!agent) {
      return {
        ...inputData,
        generationType,
        sceneCount,
        conceptBrief: inputData.idea,
      };
    }

    const prompt = [
      `Analyze this creative request and prepare a cohesive production brief.`,
      `Generation Type: ${generationType}`,
      `User Idea: "${inputData.idea}"`,
      inputData.genre ? `Genre: ${inputData.genre}` : null,
      inputData.visualStyle ? `Visual Style: ${inputData.visualStyle}` : null,
      inputData.tone ? `Tone: ${inputData.tone}` : null,
      inputData.targetAudience ? `Target Audience: ${inputData.targetAudience}` : null,
      generationType === 'storyboard' ? `Target Scene Count: ${sceneCount}` : null,
      inputData.feedback ? `User Revision Feedback: ${inputData.feedback}` : null,
      ``,
      `Produce a concise creative brief including:`,
      `1. Working Title & Core Concept`,
      `2. Consistent Character Visual Sheet (exact clothing, hair, age, distinguishing features so characters stay identical across scenes)`,
      `3. Setting, Atmosphere, Color Palette, and Lighting Direction`,
      `4. Narrative Arc / Beat Outline (${generationType === 'storyboard' ? `${sceneCount} distinct beats` : 'key beats'})`,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await agent.generate([{ role: 'user', content: prompt }]);

    return {
      idea: inputData.idea,
      generationType,
      genre: inputData.genre,
      visualStyle: inputData.visualStyle,
      sceneCount,
      tone: inputData.tone,
      targetAudience: inputData.targetAudience,
      feedback: inputData.feedback,
      conceptBrief: result.text,
    };
  },
});

const generateStructuredContentStep = createStep({
  id: 'generate-structured-content',
  description:
    'Generates the full story, storyboard scenes with image/video prompts, or creative content from the concept brief.',
  inputSchema: z.object({
    idea: z.string(),
    generationType: generationTypeEnum,
    genre: z.string().optional(),
    visualStyle: z.string().optional(),
    sceneCount: z.number(),
    tone: z.string().optional(),
    targetAudience: z.string().optional(),
    feedback: z.string().optional(),
    conceptBrief: z.string(),
  }),
  outputSchema: z.object({
    idea: z.string(),
    generationType: generationTypeEnum,
    genre: z.string().optional(),
    visualStyle: z.string().optional(),
    sceneCount: z.number(),
    conceptBrief: z.string(),
    formattedOutput: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('creative-generator-agent');
    if (!agent) {
      return {
        idea: inputData.idea,
        generationType: inputData.generationType,
        genre: inputData.genre,
        visualStyle: inputData.visualStyle,
        sceneCount: inputData.sceneCount,
        conceptBrief: inputData.conceptBrief,
        formattedOutput: inputData.conceptBrief,
      };
    }

    let formatInstructions = '';
    if (inputData.generationType === 'storyboard') {
      formatInstructions = `Generate a complete ${inputData.sceneCount}-scene storyboard using the exact Storyboard Response Format:
- Story Title
- Character Consistency Guide
- For each scene (1 to ${inputData.sceneCount}):
  - Scene Number
  - Scene Description (location, actions, mood)
  - Characters (consistent appearance details)
  - Camera Angle
  - Lighting
  - Image Generation Prompt (ready to copy into AI image models, specifying subject, environment, lighting, camera angle, composition, and ${inputData.visualStyle || 'cinematic'} style)
  - Video Animation Prompt (camera movement, character movement, background animation, cinematic effects, duration & transition)`;
    } else if (inputData.generationType === 'story') {
      formatInstructions = `Generate a complete original story using the Story Response Format:
- Title
- Genre
- Characters
- Story
- Ending`;
    } else if (inputData.generationType === 'image-prompt') {
      formatInstructions = `Generate an optimized AI image prompt using the Image Prompt Response Format:
- Subject
- Environment
- Visual Style
- Lighting
- Camera Angle
- Final Image Prompt`;
    } else if (inputData.generationType === 'video-prompt') {
      formatInstructions = `Generate a cinematic AI video generation prompt with:
- Title / Concept
- Duration & Transitions
- Camera Movement & Framing
- Character Movement & Actions
- Background Animation & Atmospheric Effects
- Final Video Prompt (copy-ready)`;
    } else {
      formatInstructions = `Generate complete, ready-to-use marketing/creative content tailored to the tone (${inputData.tone || 'engaging'}) and audience (${inputData.targetAudience || 'general'}), organized into clear structured sections.`;
    }

    const prompt = [
      `Using this approved creative brief:`,
      inputData.conceptBrief,
      ``,
      formatInstructions,
      inputData.feedback ? `\nMake sure to incorporate this feedback: ${inputData.feedback}` : '',
      `\nEnsure every prompt and section is vivid, specific, non-generic, and directly copy-pasteable.`,
    ].join('\n');

    const result = await agent.generate([{ role: 'user', content: prompt }]);

    return {
      idea: inputData.idea,
      generationType: inputData.generationType,
      genre: inputData.genre,
      visualStyle: inputData.visualStyle,
      sceneCount: inputData.sceneCount,
      conceptBrief: inputData.conceptBrief,
      formattedOutput: result.text,
    };
  },
});

const extractStructuredJsonStep = createStep({
  id: 'extract-structured-json',
  description:
    'Extracts structured JSON metadata (title, character consistency guide, and scene-by-scene prompts) alongside the formatted output.',
  inputSchema: z.object({
    idea: z.string(),
    generationType: generationTypeEnum,
    genre: z.string().optional(),
    visualStyle: z.string().optional(),
    sceneCount: z.number(),
    conceptBrief: z.string(),
    formattedOutput: z.string(),
  }),
  outputSchema: workflowOutputSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error('inputData missing');
    const agent = mastra?.getAgent('creative-generator-agent');

    const fallbackResult = {
      title: inputData.idea.slice(0, 80),
      generationType: inputData.generationType,
      genre: inputData.genre,
      visualStyle: inputData.visualStyle,
      characterConsistencyGuide: [],
      scenes: [],
      formattedOutput: inputData.formattedOutput,
      rawDraft: inputData.conceptBrief,
    };

    if (!agent) return fallbackResult;

    const extractionPrompt = `Convert the creative output below into strict JSON ONLY (no markdown fences, no commentary).
Required JSON schema:
{
  "title": "string",
  "characterConsistencyGuide": [{"name": "string", "appearance": "string", "role": "string"}],
  "scenes": [
    {
      "sceneNumber": 1,
      "sceneDescription": "string",
      "characters": "string",
      "cameraAngle": "string",
      "lighting": "string",
      "actions": "string",
      "imageGenerationPrompt": "string",
      "videoAnimationPrompt": "string",
      "durationSeconds": 5,
      "transition": "string"
    }
  ]
}
If there are no scenes (e.g. for a single image prompt or marketing copy), return "scenes": [].

Creative Output:
${inputData.formattedOutput}`;

    try {
      const result = await agent.generate([{ role: 'user', content: extractionPrompt }]);
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          title: typeof parsed.title === 'string' && parsed.title ? parsed.title : fallbackResult.title,
          generationType: inputData.generationType,
          genre: inputData.genre,
          visualStyle: inputData.visualStyle,
          characterConsistencyGuide: Array.isArray(parsed.characterConsistencyGuide)
            ? parsed.characterConsistencyGuide
            : [],
          scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
          formattedOutput: inputData.formattedOutput,
          rawDraft: inputData.conceptBrief,
        };
      }
    } catch {
      // Fallback to formattedOutput without structured scenes if JSON parsing fails
    }

    return fallbackResult;
  },
});

export const creativeGeneratorWorkflow = createWorkflow({
  id: 'creative-generator-workflow',
  description:
    'Transforms simple user ideas into structured stories, scene-by-scene storyboards with consistent characters, AI image prompts, cinematic video animation prompts, and creative marketing content.',
  requestContextSchema,
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
})
  .then(analyzeAndDevelopConceptStep)
  .then(generateStructuredContentStep)
  .then(extractStructuredJsonStep);

commitNamedWorkflow(
  creativeGeneratorWorkflow,
  'Creative Story, Storyboard & Prompt Generation Pipeline',
);

