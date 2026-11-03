/**
 * registry/skill-registry.ts
 *
 * Validated registry for composable, independently testable skills.
 * Enforces Zod input/output schemas, required permissions, and tool availability.
 */

import { z } from 'zod';
import {
  SkillManifest,
  SkillManifestSchema,
  AgentDomain,
} from './manifest-schemas';
import {
  registerSchemaRef,
  hasSchemaRef,
} from '../schemas/domain-schemas';
import {
  resolvePrincipalPermissions,
  assertRequiredScopes,
} from '../services/permission-service';
import { AVAILABLE_TOOLS_MAP } from '../agents/dynamic-agent-factory';

export interface RegisteredSkill<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  manifest: SkillManifest;
  instructions: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  execute: (
    input: z.infer<TInputSchema>,
    context?: any
  ) => Promise<z.infer<TOutputSchema>>;
}

class SkillRegistryStore {
  private readonly skills = new Map<string, RegisteredSkill<any, any>>();

  public register<
    TInputSchema extends z.ZodTypeAny,
    TOutputSchema extends z.ZodTypeAny,
  >(skill: RegisteredSkill<TInputSchema, TOutputSchema>): RegisteredSkill<TInputSchema, TOutputSchema> {
    const validatedManifest = SkillManifestSchema.parse(skill.manifest);

    if (this.skills.has(validatedManifest.id)) {
      throw new Error(`Duplicate skill ID '${validatedManifest.id}' in SkillRegistry`);
    }

    // Register schema refs in global schema registry
    registerSchemaRef(validatedManifest.inputSchemaRef, skill.inputSchema);
    registerSchemaRef(validatedManifest.outputSchemaRef, skill.outputSchema);

    // Verify required tools exist
    for (const toolId of validatedManifest.requiredTools) {
      if (!AVAILABLE_TOOLS_MAP[toolId]) {
        throw new Error(
          `Skill '${validatedManifest.id}' references unregistered tool '${toolId}'`
        );
      }
    }

    const entry: RegisteredSkill<TInputSchema, TOutputSchema> = {
      ...skill,
      manifest: validatedManifest,
    };

    this.skills.set(validatedManifest.id, entry);
    return entry;
  }

  public getById(id: string): RegisteredSkill<any, any> | undefined {
    return this.skills.get(id);
  }

  public has(id: string): boolean {
    return this.skills.has(id);
  }

  public list(): SkillManifest[] {
    return Array.from(this.skills.values()).map((s) => s.manifest);
  }

  public listByDomain(domain: AgentDomain): SkillManifest[] {
    return this.list().filter((m) => m.domain === domain);
  }

  public async execute<TOutput = any>(
    skillId: string,
    rawInput: unknown,
    executionContext?: any
  ): Promise<TOutput> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill '${skillId}' is not registered`);
    }

    // 1. Enforce required permissions
    const principal = resolvePrincipalPermissions(executionContext);
    assertRequiredScopes(
      principal,
      skill.manifest.requiredPermissions,
      `skill:${skillId}`
    );

    // 2. Validate input with Zod
    const parsedInput = skill.inputSchema.parse(rawInput ?? {});

    // 3. Execute skill logic
    const rawOutput = await skill.execute(parsedInput, executionContext);

    // 4. Validate output with Zod
    return skill.outputSchema.parse(rawOutput) as TOutput;
  }

  public validateAll(): {
    valid: boolean;
    totalSkills: number;
    errors: string[];
  } {
    const errors: string[] = [];
    for (const [id, skill] of this.skills.entries()) {
      const parsed = SkillManifestSchema.safeParse(skill.manifest);
      if (!parsed.success) {
        errors.push(`Invalid manifest for skill '${id}': ${parsed.error.message}`);
      }
      if (!hasSchemaRef(skill.manifest.inputSchemaRef)) {
        errors.push(`Skill '${id}' missing inputSchemaRef '${skill.manifest.inputSchemaRef}'`);
      }
      if (!hasSchemaRef(skill.manifest.outputSchemaRef)) {
        errors.push(`Skill '${id}' missing outputSchemaRef '${skill.manifest.outputSchemaRef}'`);
      }
      for (const toolId of skill.manifest.requiredTools) {
        if (!AVAILABLE_TOOLS_MAP[toolId]) {
          errors.push(`Skill '${id}' references missing tool '${toolId}'`);
        }
      }
    }
    return {
      valid: errors.length === 0,
      totalSkills: this.skills.size,
      errors,
    };
  }
}

export const skillRegistry = new SkillRegistryStore();

