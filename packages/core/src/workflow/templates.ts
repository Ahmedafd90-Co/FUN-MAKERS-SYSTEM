/**
 * Workflow template service — CRUD with versioning.
 *
 * Templates are immutable once created. Updates create a new version (new row)
 * and deactivate the previous version. This ensures existing workflow instances
 * continue running under the template version they were started with.
 */

import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import {
  CreateWorkflowTemplateSchema,
  UpdateWorkflowTemplateSchema,
  WorkflowTemplateConfigSchema,
  WorkflowStepDefSchema,
  type CreateWorkflowTemplateInput,
  type UpdateWorkflowTemplateInput,
} from '@fmksa/contracts';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TemplateNotFoundError extends Error {
  constructor(idOrCode: string) {
    super(`Workflow template "${idOrCode}" not found.`);
    this.name = 'TemplateNotFoundError';
  }
}

export class DuplicateTemplateCodeError extends Error {
  constructor(code: string) {
    super(`Workflow template code "${code}" already exists.`);
    this.name = 'DuplicateTemplateCodeError';
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const worfklowTemplateService = {
  /**
   * Create a new workflow template with steps.
   *
   * Validates unique code, creates template (version = 1) + steps in a
   * transaction, writes audit log, and returns the template with steps.
   */
  async createTemplate(input: CreateWorkflowTemplateInput) {
    const parsed = CreateWorkflowTemplateSchema.parse(input);

    // Validate unique code
    const existing = await prisma.workflowTemplate.findUnique({
      where: { code: parsed.code },
    });
    if (existing) {
      throw new DuplicateTemplateCodeError(parsed.code);
    }

    // Validate config
    const config = WorkflowTemplateConfigSchema.parse(parsed.config);

    // Validate steps
    const steps = parsed.steps.map((s) => WorkflowStepDefSchema.parse(s));

    // Sort steps by orderIndex
    steps.sort((a, b) => a.orderIndex - b.orderIndex);

    const result = await (prisma as any).$transaction(async (tx: any) => {
      const template = await tx.workflowTemplate.create({
        data: {
          code: parsed.code,
          name: parsed.name,
          recordType: parsed.recordType,
          version: 1,
          isActive: true,
          configJson: config as any,
          createdBy: parsed.createdBy,
        },
      });

      const createdSteps = [];
      for (const step of steps) {
        const created = await tx.workflowStep.create({
          data: {
            templateId: template.id,
            orderIndex: step.orderIndex,
            name: step.name,
            approverRuleJson: step.approverRule as any,
            slaHours: step.slaHours ?? null,
            isOptional: step.isOptional,
            requirementFlagsJson: step.requirementFlags as any,
          },
        });
        createdSteps.push(created);
      }

      await auditService.log(
        {
          actorUserId: parsed.createdBy,
          actorSource: 'user',
          action: 'workflow_template.create',
          resourceType: 'workflow_template',
          resourceId: template.id,
          beforeJson: {},
          afterJson: {
            code: template.code,
            name: template.name,
            recordType: template.recordType,
            version: template.version,
            stepCount: createdSteps.length,
          },
        },
        tx,
      );

      return { ...template, steps: createdSteps };
    });

    return result;
  },

  /**
   * Get a template by ID with its steps ordered by orderIndex.
   */
  async getTemplate(id: string) {
    const template = await prisma.workflowTemplate.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!template) throw new TemplateNotFoundError(id);
    return template;
  },

  /**
   * Update a template by creating a new version.
   *
   * Does NOT modify the existing row. Creates a new template row with
   * version + 1 and the same code (after deactivating the old one).
   * The old code's unique constraint is handled by first removing it
   * from the old row.
   */
  async updateTemplate(id: string, input: UpdateWorkflowTemplateInput) {
    const parsed = UpdateWorkflowTemplateSchema.parse(input);

    const existing = await prisma.workflowTemplate.findUnique({
      where: { id },
      include: { steps: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!existing) throw new TemplateNotFoundError(id);

    // Validate config if provided
    const config = parsed.config
      ? WorkflowTemplateConfigSchema.parse(parsed.config)
      : (existing.configJson as any);

    // Validate steps if provided
    const steps = parsed.steps
      ? parsed.steps
          .map((s) => WorkflowStepDefSchema.parse(s))
          .sort((a, b) => a.orderIndex - b.orderIndex)
      : null;

    const result = await (prisma as any).$transaction(async (tx: any) => {
      // Deactivate old template and release its unique code
      // We use a versioned code pattern: old versions get code suffixed with version
      await tx.workflowTemplate.update({
        where: { id: existing.id },
        data: {
          isActive: false,
          code: `${existing.code}__v${existing.version}`,
        },
      });

      // Create new version
      const newTemplate = await tx.workflowTemplate.create({
        data: {
          code: existing.code,
          name: parsed.name ?? existing.name,
          recordType: existing.recordType,
          version: existing.version + 1,
          isActive: true,
          configJson: config as any,
          createdBy: parsed.updatedBy,
        },
      });

      // Normalize steps to a consistent shape
      const stepDefs: Array<{
        orderIndex: number;
        name: string;
        approverRule: any;
        slaHours: number | null;
        isOptional: boolean;
        requirementFlags: any;
      }> = steps
        ? steps.map((s) => ({
            orderIndex: s.orderIndex,
            name: s.name,
            approverRule: s.approverRule,
            slaHours: s.slaHours ?? null,
            isOptional: s.isOptional,
            requirementFlags: s.requirementFlags,
          }))
        : existing.steps.map((s: any) => ({
            orderIndex: s.orderIndex,
            name: s.name,
            approverRule: s.approverRuleJson,
            slaHours: s.slaHours,
            isOptional: s.isOptional,
            requirementFlags: s.requirementFlagsJson,
          }));

      const createdSteps = [];
      for (const step of stepDefs) {
        const created = await tx.workflowStep.create({
          data: {
            templateId: newTemplate.id,
            orderIndex: step.orderIndex,
            name: step.name,
            approverRuleJson: step.approverRule as any,
            slaHours: step.slaHours ?? null,
            isOptional: step.isOptional ?? false,
            requirementFlagsJson: (step.requirementFlags ?? {}) as any,
          },
        });
        createdSteps.push(created);
      }

      await auditService.log(
        {
          actorUserId: parsed.updatedBy,
          actorSource: 'user',
          action: 'workflow_template.update',
          resourceType: 'workflow_template',
          resourceId: newTemplate.id,
          beforeJson: {
            id: existing.id,
            version: existing.version,
            name: existing.name,
          },
          afterJson: {
            id: newTemplate.id,
            version: newTemplate.version,
            name: newTemplate.name,
            stepCount: createdSteps.length,
          },
        },
        tx,
      );

      return { ...newTemplate, steps: createdSteps };
    });

    return result;
  },

  /**
   * Deactivate a template. Existing instances continue under their
   * template version.
   */
  async deactivateTemplate(id: string, deactivatedBy: string) {
    const existing = await prisma.workflowTemplate.findUnique({
      where: { id },
    });

    if (!existing) throw new TemplateNotFoundError(id);

    const result = await (prisma as any).$transaction(async (tx: any) => {
      const updated = await tx.workflowTemplate.update({
        where: { id },
        data: { isActive: false },
      });

      await auditService.log(
        {
          actorUserId: deactivatedBy,
          actorSource: 'user',
          action: 'workflow_template.deactivate',
          resourceType: 'workflow_template',
          resourceId: id,
          beforeJson: { isActive: true },
          afterJson: { isActive: false },
        },
        tx,
      );

      return updated;
    });

    return result;
  },

  /**
   * List templates, optionally filtered by recordType and isActive.
   * Returns the most recent version per code.
   */
  async listTemplates(filters?: { recordType?: string; isActive?: boolean }) {
    const where: any = {};

    if (filters?.recordType) {
      where.recordType = filters.recordType;
    }

    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    const templates = await prisma.workflowTemplate.findMany({
      where,
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    });

    // Group by original code (strip __vN suffix) and take highest version
    const byCode = new Map<string, typeof templates[number]>();
    for (const t of templates) {
      // Original code: strip __vN suffix if present
      const originalCode = t.code.replace(/__v\d+$/, '');
      const existing = byCode.get(originalCode);
      if (!existing || t.version > existing.version) {
        byCode.set(originalCode, t);
      }
    }

    return [...byCode.values()];
  },

  /**
   * Find the currently active template by code. Returns the most recent
   * active version.
   */
  async findActiveByCode(code: string) {
    const template = await prisma.workflowTemplate.findFirst({
      where: {
        code,
        isActive: true,
      },
      include: {
        steps: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { version: 'desc' },
    });

    return template;
  },
};

// Alias for consistent naming in exports
export const workflowTemplateService = worfklowTemplateService;
