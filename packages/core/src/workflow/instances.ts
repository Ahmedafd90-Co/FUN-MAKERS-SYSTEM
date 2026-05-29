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
import { auditService, type TransactionClient } from '../audit/service';
import { workflowTemplateService } from './templates';
import * as workflowEvents from './events';
import type { DeferredWorkflowEvent } from './deferred';
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
// Shared start-instance internals (PIC-80) — used by both startInstance (own
// $transaction + inline emit) and startInstanceDeferred (caller's tx + deferred
// emit), so the two paths share one validation + one set of DB writes.
// ---------------------------------------------------------------------------

type StartInstanceParams = {
  templateCode: string;
  recordType: string;
  recordId: string;
  projectId: string;
  startedBy: string;
  resolutionSource?: ResolutionSource;
};

/** Validate template active + project exists + no duplicate in-progress instance. Throws the same errors as before. */
async function validateStartInstance(params: StartInstanceParams) {
  const { templateCode, recordType, recordId, projectId } = params;

  const template = await workflowTemplateService.findActiveByCode(templateCode);
  if (!template) {
    throw new TemplateNotActiveError(templateCode);
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }

  const existingInstance = await prisma.workflowInstance.findFirst({
    where: { recordType, recordId, status: { in: ['in_progress', 'returned'] } },
  });
  if (existingInstance) {
    throw new DuplicateInstanceError(recordType, recordId);
  }

  const firstStep = template.steps[0];
  if (!firstStep) {
    throw new Error(`Template "${templateCode}" has no steps.`);
  }

  return { template, firstStep };
}

/** The instance + action + audit DB writes, on the given client (base or a tx). */
async function writeStartInstanceRows(
  client: any,
  params: StartInstanceParams,
  template: any,
  firstStep: any,
  now: Date,
) {
  const { recordType, recordId, projectId, startedBy, resolutionSource } = params;

  const instance = await client.workflowInstance.create({
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

  await client.workflowAction.create({
    data: {
      instanceId: instance.id,
      stepId: firstStep.id,
      actorUserId: startedBy,
      action: 'started',
      actedAt: now,
      metadataJson: resolutionSource ? { resolutionSource } : undefined,
    },
  });

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
    client,
  );

  return instance;
}

/** Build the 'workflow.started' event payload (shared by inline + deferred emit). */
function buildStartedPayload(
  instanceId: string,
  params: StartInstanceParams,
  template: any,
  firstStep: any,
) {
  return {
    instanceId,
    templateCode: template.code,
    recordType: params.recordType,
    recordId: params.recordId,
    projectId: params.projectId,
    actorUserId: params.startedBy,
    stepName: firstStep.name,
  };
}

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
  async startInstance(input: StartInstanceParams) {
    const { template, firstStep } = await validateStartInstance(input);
    const now = new Date();

    // Own $transaction (unchanged behavior), then inline post-commit emit.
    const result = await (prisma as any).$transaction(async (txClient: any) =>
      writeStartInstanceRows(txClient, input, template, firstStep, now),
    );

    // Publish event (outside transaction)
    await workflowEvents.emit(
      'workflow.started',
      buildStartedPayload(result.id, input, template, firstStep),
    );

    // Return with template and step info
    return this.getInstance(result.id);
  },

  /**
   * PIC-80: transaction-injected, deferred-emit variant of startInstance.
   *
   * Same validation + instance/action/audit writes, but on the CALLER'S
   * transaction (`input.tx`) so they commit/roll back atomically with the
   * caller's other writes (e.g. the entity create — closing the orphan window).
   * Does NOT emit 'workflow.started' inline: returns a DeferredWorkflowEvent for
   * the caller to dispatch via `dispatchDeferred` AFTER the tx commits, so a
   * rollback can't leak the email side effect (no false atomicity).
   *
   * Additive sibling rather than an optional `tx` on startInstance: object
   * literals can't carry the method overload that an optional-tx param needs to
   * keep startInstance's strongly-typed return (relied on by an existing test
   * caller) — a union return would force narrowing at every call site. This
   * keeps startInstance byte-identical for its 14 existing callers.
   */
  async startInstanceDeferred(
    input: StartInstanceParams & { tx: TransactionClient },
  ): Promise<{ instanceId: string; deferredEvent: DeferredWorkflowEvent }> {
    const { template, firstStep } = await validateStartInstance(input);
    const now = new Date();

    const instance = await writeStartInstanceRows(input.tx, input, template, firstStep, now);

    return {
      instanceId: instance.id as string,
      deferredEvent: {
        name: 'workflow.started',
        payload: buildStartedPayload(instance.id, input, template, firstStep),
      },
    };
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
