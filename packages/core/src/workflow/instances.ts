/**
 * Workflow instance service — creates and retrieves workflow instances.
 *
 * An instance tracks the progress of a specific record through a workflow
 * template. The engine is record-type agnostic: it operates on opaque
 * (recordType, recordId) pairs.
 *
 * Task 1.5.3: Instance creation
 * Task 1.5.7: SLA tracking on getInstance
 */

import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { workflowTemplateService } from './templates';
import * as workflowEvents from './events';
import type { ResolutionSource } from './template-resolution';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InstanceNotFoundError extends Error {
  constructor(id: string) {
    super(`Workflow instance "${id}" not found.`);
    this.name = 'InstanceNotFoundError';
  }
}

export class DuplicateInstanceError extends Error {
  constructor(recordType: string, recordId: string) {
    super(
      `An in-progress workflow instance already exists for ${recordType}:${recordId}.`,
    );
    this.name = 'DuplicateInstanceError';
  }
}

export class TemplateNotActiveError extends Error {
  constructor(templateCode: string) {
    super(
      `No active workflow template found with code "${templateCode}".`,
    );
    this.name = 'TemplateNotActiveError';
  }
}

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project "${projectId}" not found.`);
    this.name = 'ProjectNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// SLA info type
// ---------------------------------------------------------------------------

export type SlaInfo = {
  currentStepSlaHours: number | null;
  currentStepStartedAt: Date;
  hoursElapsed: number;
  hoursRemaining: number | null;
  isBreached: boolean;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const workflowInstanceService = {
  /**
   * Start a new workflow instance for a (recordType, recordId) pair.
   *
   * - Finds active template by code (most recent version)
   * - Validates: template exists + active, project exists
   * - Checks: no existing in_progress instance for (recordType, recordId)
   * - Creates WorkflowInstance with status = 'in_progress', currentStepId = first step
   * - Writes WorkflowAction { action: 'started', ... }
   * - Writes audit log
   * - Publishes 'workflow.started' event
   * - Returns instance with current step info
   */
  async startInstance(input: {
    templateCode: string;
    recordType: string;
    recordId: string;
    projectId: string;
    startedBy: string;
    /** How the template was resolved — stored in the 'started' action metadata for provenance. */
    resolutionSource?: ResolutionSource;
  }) {
    const { templateCode, recordType, recordId, projectId, startedBy, resolutionSource } = input;

    // Find active template
    const template = await workflowTemplateService.findActiveByCode(templateCode);
    if (!template) {
      throw new TemplateNotActiveError(templateCode);
    }

    // Validate project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    // Check for existing in-progress instance
    const existingInstance = await prisma.workflowInstance.findFirst({
      where: {
        recordType,
        recordId,
        status: { in: ['in_progress', 'returned'] },
      },
    });
    if (existingInstance) {
      throw new DuplicateInstanceError(recordType, recordId);
    }

    // First step (sorted by orderIndex)
    const firstStep = template.steps[0];
    if (!firstStep) {
      throw new Error(
        `Template "${templateCode}" has no steps.`,
      );
    }

    const now = new Date();

    const result = await (prisma as any).$transaction(async (tx: any) => {
      // Create instance
      const instance = await tx.workflowInstance.create({
        data: {
          templateId: template.id,
          recordType,
          recordId,
          projectId,
          status: 'in_progress',
          currentStepId: firstStep.id,
          startedBy,
          startedAt: now,
        },
      });

      // Write the 'started' action — include resolution provenance in metadata
      await tx.workflowAction.create({
        data: {
          instanceId: instance.id,
          stepId: firstStep.id,
          actorUserId: startedBy,
          action: 'started',
          actedAt: now,
          metadataJson: resolutionSource ? { resolutionSource } : undefined,
        },
      });

      // Audit log
      await auditService.log(
        {
          actorUserId: startedBy,
          actorSource: 'user',
          action: 'workflow.instance_started',
          resourceType: 'workflow_instance',
          resourceId: instance.id,
          projectId,
          beforeJson: {},
          afterJson: {
            templateCode: template.code,
            recordType,
            recordId,
            status: 'in_progress',
            currentStep: firstStep.name,
          },
        },
        tx,
      );

      return instance;
    });

    // Publish event (outside transaction)
    await workflowEvents.emit('workflow.started', {
      instanceId: result.id,
      templateCode: template.code,
      recordType,
      recordId,
      projectId,
      actorUserId: startedBy,
      stepName: firstStep.name,
    });

    // Return with template and step info
    return this.getInstance(result.id);
  },

  /**
   * Find the most recent workflow instance for a (recordType, recordId) pair.
   * Returns null if none exists (not an error — some records may not have workflows).
   */
  async getInstanceByRecord(recordType: string, recordId: string) {
    const instance = await prisma.workflowInstance.findFirst({
      where: { recordType, recordId },
      orderBy: { startedAt: 'desc' },
      include: {
        template: {
          include: {
            steps: { orderBy: { orderIndex: 'asc' } },
          },
        },
        actions: {
          orderBy: { actedAt: 'asc' },
          include: {
            step: { select: { id: true, name: true, outcomeType: true } },
          },
        },
      },
    });

    if (!instance) return null;

    // Resolve actor names — WorkflowAction has no direct User relation
    const actorIds = [...new Set(instance.actions.map((a) => a.actorUserId))];
    const actors = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    });
    const actorMap = new Map(actors.map((a) => [a.id, a]));
    const actionsWithActors = instance.actions.map((a) => ({
      ...a,
      actor: actorMap.get(a.actorUserId) ?? { id: a.actorUserId, name: 'Unknown', email: '' },
    }));

    const currentStep = instance.currentStepId
      ? instance.template.steps.find((s) => s.id === instance.currentStepId)
      : null;

    const slaInfo = computeSlaInfo(instance, currentStep);

    // Extract resolution source from the 'started' action metadata (provenance)
    const startedAction = instance.actions.find((a) => a.action === 'started');
    const resolutionSource: ResolutionSource | null =
      (startedAction?.metadataJson as Record<string, unknown> | null)?.resolutionSource as ResolutionSource | null
      ?? null;

    return {
      ...instance,
      actions: actionsWithActors,
      currentStep,
      slaInfo,
      resolutionSource,
    };
  },

  /**
   * Get a workflow instance by ID.
   *
   * Returns the instance with template, steps, actions, current step,
   * and SLA info (Task 1.5.7).
   */
  async getInstance(id: string) {
    const instance = await prisma.workflowInstance.findUnique({
      where: { id },
      include: {
        template: {
          include: {
            steps: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        actions: {
          orderBy: { actedAt: 'asc' },
          include: {
            step: { select: { id: true, name: true, outcomeType: true } },
          },
        },
      },
    });

    if (!instance) throw new InstanceNotFoundError(id);

    // Find current step
    const currentStep = instance.currentStepId
      ? instance.template.steps.find((s) => s.id === instance.currentStepId)
      : null;

    // SLA tracking (Task 1.5.7)
    const slaInfo = computeSlaInfo(instance, currentStep);

    return {
      ...instance,
      currentStep,
      slaInfo,
    };
  },
};

// ---------------------------------------------------------------------------
// SLA computation (Task 1.5.7)
// ---------------------------------------------------------------------------

/**
 * Compute SLA info for the current step.
 *
 * The currentStepStartedAt is derived from the most recent action that
 * changed the currentStepId (the last 'started', 'approved', or 'returned'
 * action that moved to the current step). SLA is computed on read — no
 * background job in Module 1.
 */
function computeSlaInfo(
  instance: {
    currentStepId: string | null;
    status: string;
    actions: Array<{ actedAt: Date; action: string; stepId: string }>;
  },
  currentStep: { slaHours: number | null } | null | undefined,
): SlaInfo | null {
  if (!instance.currentStepId || !currentStep) return null;

  // Find the action that set the current step (most recent transition to it)
  // This is the most recent action with the current stepId, or the 'started' action
  const relevantActions = instance.actions.filter(
    (a) =>
      a.stepId === instance.currentStepId &&
      ['started', 'approved', 'returned'].includes(a.action),
  );

  // Fallback: if no relevant action (shouldn't happen), use instance start
  const lastTransitionAction = relevantActions[relevantActions.length - 1];
  const currentStepStartedAt = lastTransitionAction?.actedAt ?? new Date();

  const now = new Date();
  const hoursElapsed =
    (now.getTime() - currentStepStartedAt.getTime()) / (1000 * 60 * 60);

  const slaHours = currentStep.slaHours;

  return {
    currentStepSlaHours: slaHours,
    currentStepStartedAt,
    hoursElapsed: Math.round(hoursElapsed * 100) / 100,
    hoursRemaining: slaHours != null
      ? Math.round((slaHours - hoursElapsed) * 100) / 100
      : null,
    isBreached: slaHours != null ? hoursElapsed > slaHours : false,
  };
}
