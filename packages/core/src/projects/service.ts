/**
 * Projects service — CRUD operations for the Project entity.
 *
 * Every mutation writes an audit log entry. Read operations enforce
 * project-scope isolation via accessControlService.
 */

import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { accessControlService } from '../access-control/service';
import { getDerivedRevisedContractValue } from '../commercial/revised-contract-value';
import { PROJECT_SETTINGS_DEFAULTS } from './project-settings-defaults';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateProjectInput = {
  code: string;
  name: string;
  entityId: string;
  currencyCode: string;
  startDate: Date;
  endDate?: Date | null | undefined;
  createdBy: string;
  // Phase D2 — financial control baseline
  contractValue?: number | null | undefined;
};

export type UpdateProjectInput = {
  name?: string | undefined;
  entityId?: string | undefined;
  currencyCode?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | null | undefined;
  status?: 'active' | 'on_hold' | 'completed' | undefined;
  // Phase D2 — financial control baseline
  contractValue?: number | null | undefined;
  revisedContractValue?: number | null | undefined;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const projectsService = {
  /**
   * Create a new project. Validates unique code and FK references.
   * Applies default project settings from project-settings-defaults.ts.
   * Writes an audit log entry.
   */
  async createProject(input: CreateProjectInput) {
    // Validate unique code
    const existing = await prisma.project.findUnique({
      where: { code: input.code },
    });
    if (existing) {
      throw new Error(`Project code "${input.code}" already exists.`);
    }

    // Validate entity exists
    const entity = await prisma.entity.findUnique({
      where: { id: input.entityId },
    });
    if (!entity) {
      throw new Error(`Entity "${input.entityId}" not found.`);
    }

    // Validate currency exists
    const currency = await prisma.currency.findUnique({
      where: { code: input.currencyCode },
    });
    if (!currency) {
      throw new Error(`Currency "${input.currencyCode}" not found.`);
    }

    // Create project + default settings in a transaction
    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          code: input.code,
          name: input.name,
          entityId: input.entityId,
          currencyCode: input.currencyCode,
          status: 'active',
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          contractValue: input.contractValue ?? null,
          createdBy: input.createdBy,
        },
        include: {
          entity: true,
          currency: true,
        },
      });

      // Apply default settings
      const now = new Date();
      const settingsData = Object.entries(PROJECT_SETTINGS_DEFAULTS).map(
        ([key, value]) => ({
          projectId: p.id,
          key,
          valueJson: JSON.parse(JSON.stringify(value)),
          updatedAt: now,
          updatedBy: input.createdBy,
        }),
      );

      if (settingsData.length > 0) {
        await tx.projectSetting.createMany({ data: settingsData });
      }

      // Audit log
      await auditService.log(
        {
          actorUserId: input.createdBy,
          actorSource: 'user',
          action: 'project.create',
          resourceType: 'project',
          resourceId: p.id,
          projectId: p.id,
          beforeJson: {},
          afterJson: {
            id: p.id,
            code: p.code,
            name: p.name,
            entityId: p.entityId,
            currencyCode: p.currencyCode,
            status: p.status,
            contractValue: p.contractValue?.toString() ?? null,
          },
        },
        tx,
      );

      return p;
    });

    return project;
  },

  /**
   * Get a single project. Checks project-scope isolation: the requesting
   * user must be assigned to the project or hold cross_project.read.
   *
   * Returns `revisedContractValueDerived` alongside the stored column so
   * the Project Overview's Financial Baseline card reads the same live
   * derivation as the Commercial Dashboard (Phase 2 fix, 2026-04-21).
   * The stored column `project.revisedContractValue` is kept for
   * backward compatibility but is legacy — all surfaces should read the
   * derived value.
   */
  async getProject(id: string, requestingUserId: string) {
    // Check scope
    const assigned = await accessControlService.isAssignedToProject(
      requestingUserId,
      id,
    );
    if (!assigned) {
      const crossProject = await accessControlService.canReadAcrossProjects(
        requestingUserId,
      );
      if (!crossProject) {
        throw new Error('You do not have access to this project.');
      }
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        entity: true,
        currency: true,
      },
    });

    if (!project) {
      throw new Error(`Project "${id}" not found.`);
    }

    // Live-derived revised contract value — uses the shared helper so this
    // always matches the Commercial Dashboard KPI. Null when the project
    // has no contractValue.
    const revisedContractValueDerived =
      await getDerivedRevisedContractValue(id);

    return { ...project, revisedContractValueDerived };
  },

  /**
   * Update a project. Writes an audit log with before/after diff.
   */
  async updateProject(id: string, data: UpdateProjectInput, updatedBy: string) {
    const project = await prisma.$transaction(async (tx) => {
      const before = await tx.project.findUnique({ where: { id } });
      if (!before) {
        throw new Error(`Project "${id}" not found.`);
      }

      // Validate FK refs if changed
      if (data.entityId) {
        const entity = await tx.entity.findUnique({
          where: { id: data.entityId },
        });
        if (!entity) {
          throw new Error(`Entity "${data.entityId}" not found.`);
        }
      }
      if (data.currencyCode) {
        const currency = await tx.currency.findUnique({
          where: { code: data.currencyCode },
        });
        if (!currency) {
          throw new Error(`Currency "${data.currencyCode}" not found.`);
        }
      }

      const updated = await tx.project.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.entityId !== undefined && { entityId: data.entityId }),
          ...(data.currencyCode !== undefined && {
            currencyCode: data.currencyCode,
          }),
          ...(data.startDate !== undefined && { startDate: data.startDate }),
          ...(data.endDate !== undefined && { endDate: data.endDate }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.contractValue !== undefined && { contractValue: data.contractValue }),
          ...(data.revisedContractValue !== undefined && { revisedContractValue: data.revisedContractValue }),
        },
        include: {
          entity: true,
          currency: true,
        },
      });

      await auditService.log(
        {
          actorUserId: updatedBy,
          actorSource: 'user',
          action: 'project.update',
          resourceType: 'project',
          resourceId: id,
          projectId: id,
          beforeJson: {
            name: before.name,
            entityId: before.entityId,
            currencyCode: before.currencyCode,
            status: before.status,
            startDate: before.startDate.toISOString(),
            endDate: before.endDate?.toISOString() ?? null,
            contractValue: (before as any).contractValue?.toString() ?? null,
            revisedContractValue: (before as any).revisedContractValue?.toString() ?? null,
          },
          afterJson: {
            name: updated.name,
            entityId: updated.entityId,
            currencyCode: updated.currencyCode,
            status: updated.status,
            startDate: updated.startDate.toISOString(),
            endDate: updated.endDate?.toISOString() ?? null,
            contractValue: (updated as any).contractValue?.toString() ?? null,
            revisedContractValue: (updated as any).revisedContractValue?.toString() ?? null,
          },
        },
        tx,
      );

      return updated;
    });

    return project;
  },

  /**
   * Archive a project. Sets status to 'archived' with a required reason.
   */
  async archiveProject(id: string, reason: string, archivedBy: string) {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Reason is required when archiving a project.');
    }

    const project = await prisma.$transaction(async (tx) => {
      const before = await tx.project.findUnique({ where: { id } });
      if (!before) {
        throw new Error(`Project "${id}" not found.`);
      }

      if (before.status === 'archived') {
        throw new Error('Project is already archived.');
      }

      const updated = await tx.project.update({
        where: { id },
        data: { status: 'archived' },
        include: {
          entity: true,
          currency: true,
        },
      });

      await auditService.log(
        {
          actorUserId: archivedBy,
          actorSource: 'user',
          action: 'project.archive',
          resourceType: 'project',
          resourceId: id,
          projectId: id,
          beforeJson: { status: before.status },
          afterJson: { status: 'archived' },
          reason,
        },
        tx,
      );

      return updated;
    });

    return project;
  },

  /**
   * List projects the user can see. Returns only projects the user is
   * assigned to, or all projects if the user has cross_project.read.
   */
  async listProjects(opts: {
    userId: string;
    includeArchived?: boolean | undefined;
  }) {
    const { userId, includeArchived = false } = opts;

    // Check cross-project read
    const crossProject =
      await accessControlService.canReadAcrossProjects(userId);

    const where: Record<string, unknown> = {};

    if (!crossProject) {
      const projectIds =
        await accessControlService.getAssignedProjectIds(userId);
      where.id = { in: projectIds };
    }

    if (!includeArchived) {
      where.status = { not: 'archived' };
    }

    return prisma.project.findMany({
      where,
      include: {
        entity: true,
        currency: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
