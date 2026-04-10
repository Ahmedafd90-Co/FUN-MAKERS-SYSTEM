/**
 * Workflow step service — approve, reject, return, cancel.
 *
 * This is the core action handler. Each action:
 * 1. Validates the actor is a valid approver for the current step
 * 2. Writes a WorkflowAction row (append-only) — Task 1.5.5
 * 3. Updates the instance state
 * 4. Writes audit log — Task 1.5.5
 * 5. Publishes events
 *
 * Both WorkflowAction and AuditLog are written in the same transaction (1.5.5).
 */

import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { isValidApprover } from './approver-resolution';
import * as workflowEvents from './events';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StepMismatchError extends Error {
  constructor(instanceId: string, stepId: string, currentStepId: string | null) {
    super(
      `Step ${stepId} is not the current step for instance ${instanceId}. Current step: ${currentStepId}`,
    );
    this.name = 'StepMismatchError';
  }
}

export class NotAValidApproverError extends Error {
  constructor(userId: string, stepId: string) {
    super(`User ${userId} is not a valid approver for step ${stepId}.`);
    this.name = 'NotAValidApproverError';
  }
}

export class InvalidInstanceStatusError extends Error {
  constructor(instanceId: string, status: string, expectedStatuses: string[]) {
    super(
      `Instance ${instanceId} has status "${status}", expected one of: ${expectedStatuses.join(', ')}`,
    );
    this.name = 'InvalidInstanceStatusError';
  }
}

export class InvalidReturnStepError extends Error {
  constructor(returnToStepId: string) {
    super(`Cannot return to step ${returnToStepId}: not a previous step in this template.`);
    this.name = 'InvalidReturnStepError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getInstanceWithTemplate(instanceId: string) {
  const instance = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: {
      template: {
        include: {
          steps: { orderBy: { orderIndex: 'asc' } },
        },
      },
    },
  });

  if (!instance) {
    throw new Error(`Workflow instance "${instanceId}" not found.`);
  }

  return instance;
}

function findCurrentStep(instance: Awaited<ReturnType<typeof getInstanceWithTemplate>>) {
  return instance.template.steps.find((s) => s.id === instance.currentStepId);
}

function findNextStep(
  instance: Awaited<ReturnType<typeof getInstanceWithTemplate>>,
  currentOrderIndex: number,
) {
  // Find the next step after the current one (non-optional preferred, but any next step)
  const remaining = instance.template.steps.filter(
    (s) => s.orderIndex > currentOrderIndex,
  );

  // Prefer non-optional next steps
  const nextNonOptional = remaining.find((s) => !s.isOptional);
  return nextNonOptional ?? remaining[0] ?? null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const workflowStepService = {
  /**
   * Approve the current step.
   *
   * - Validates instance.currentStepId === stepId
   * - Validates actor is valid approver
   * - Writes WorkflowAction { action: 'approved' }
   * - Advances to next step or completes the workflow
   * - Audit log + events
   *
   * Also handles resubmission after return: when instance status is 'returned',
   * approving the returned-to step moves it back to 'in_progress'.
   */
  async approveStep(input: {
    instanceId: string;
    stepId: string;
    actorUserId: string;
    comment?: string;
  }) {
    const { instanceId, stepId, actorUserId, comment } = input;

    const instance = await getInstanceWithTemplate(instanceId);

    // Allow approve on in_progress or returned instances
    if (!['in_progress', 'returned'].includes(instance.status)) {
      throw new InvalidInstanceStatusError(
        instanceId,
        instance.status,
        ['in_progress', 'returned'],
      );
    }

    // Validate current step
    if (instance.currentStepId !== stepId) {
      throw new StepMismatchError(instanceId, stepId, instance.currentStepId);
    }

    const currentStep = findCurrentStep(instance);
    if (!currentStep) {
      throw new Error(`Current step not found in template.`);
    }

    // Validate approver
    const approverRule = currentStep.approverRuleJson as any;
    const valid = await isValidApprover(actorUserId, approverRule, instance.projectId);
    if (!valid) {
      throw new NotAValidApproverError(actorUserId, stepId);
    }

    const now = new Date();
    const nextStep = findNextStep(instance, currentStep.orderIndex);
    const isComplete = nextStep === null;

    const newStatus = isComplete ? 'approved' : 'in_progress';

    const result = await (prisma as any).$transaction(async (tx: any) => {
      // Write WorkflowAction (Task 1.5.5)
      await tx.workflowAction.create({
        data: {
          instanceId,
          stepId,
          actorUserId,
          action: 'approved',
          comment: comment ?? null,
          actedAt: now,
        },
      });

      // Update instance
      const updated = await tx.workflowInstance.update({
        where: { id: instanceId },
        data: {
          currentStepId: isComplete ? null : nextStep!.id,
          status: newStatus,
          completedAt: isComplete ? now : null,
        },
      });

      // Audit log (Task 1.5.5)
      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: 'workflow.step_approved',
          resourceType: 'workflow_instance',
          resourceId: instanceId,
          projectId: instance.projectId,
          beforeJson: {
            currentStep: currentStep.name,
            status: instance.status,
          },
          afterJson: {
            currentStep: isComplete ? null : nextStep!.name,
            status: newStatus,
          },
          reason: comment ?? null,
        },
        tx,
      );

      return updated;
    });

    // Publish events (outside transaction)
    await workflowEvents.emit('workflow.stepApproved', {
      instanceId,
      templateCode: instance.template.code,
      recordType: instance.recordType,
      recordId: instance.recordId,
      projectId: instance.projectId,
      actorUserId,
      stepName: currentStep.name,
      comment,
    });

    if (isComplete) {
      await workflowEvents.emit('workflow.approved', {
        instanceId,
        templateCode: instance.template.code,
        recordType: instance.recordType,
        recordId: instance.recordId,
        projectId: instance.projectId,
        actorUserId,
        comment,
      });
    }

    return result;
  },

  /**
   * Reject the current step. Comment is required.
   *
   * Sets status = 'rejected', completedAt = now().
   */
  async rejectStep(input: {
    instanceId: string;
    stepId: string;
    actorUserId: string;
    comment: string;
  }) {
    const { instanceId, stepId, actorUserId, comment } = input;

    if (!comment || comment.trim().length === 0) {
      throw new Error('Comment is required for rejection.');
    }

    const instance = await getInstanceWithTemplate(instanceId);

    if (!['in_progress', 'returned'].includes(instance.status)) {
      throw new InvalidInstanceStatusError(
        instanceId,
        instance.status,
        ['in_progress', 'returned'],
      );
    }

    if (instance.currentStepId !== stepId) {
      throw new StepMismatchError(instanceId, stepId, instance.currentStepId);
    }

    const currentStep = findCurrentStep(instance);
    if (!currentStep) {
      throw new Error(`Current step not found in template.`);
    }

    // Validate approver
    const approverRule = currentStep.approverRuleJson as any;
    const valid = await isValidApprover(actorUserId, approverRule, instance.projectId);
    if (!valid) {
      throw new NotAValidApproverError(actorUserId, stepId);
    }

    const now = new Date();

    const result = await (prisma as any).$transaction(async (tx: any) => {
      // Write WorkflowAction (Task 1.5.5)
      await tx.workflowAction.create({
        data: {
          instanceId,
          stepId,
          actorUserId,
          action: 'rejected',
          comment,
          actedAt: now,
        },
      });

      // Update instance
      const updated = await tx.workflowInstance.update({
        where: { id: instanceId },
        data: {
          status: 'rejected',
          completedAt: now,
        },
      });

      // Audit log (Task 1.5.5)
      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: 'workflow.step_rejected',
          resourceType: 'workflow_instance',
          resourceId: instanceId,
          projectId: instance.projectId,
          beforeJson: {
            currentStep: currentStep.name,
            status: instance.status,
          },
          afterJson: {
            currentStep: currentStep.name,
            status: 'rejected',
          },
          reason: comment,
        },
        tx,
      );

      return updated;
    });

    // Publish event
    await workflowEvents.emit('workflow.rejected', {
      instanceId,
      templateCode: instance.template.code,
      recordType: instance.recordType,
      recordId: instance.recordId,
      projectId: instance.projectId,
      actorUserId,
      stepName: currentStep.name,
      comment,
    });

    return result;
  },

  /**
   * Return the workflow to a previous step. Comment is required.
   *
   * If returnToStepId is provided, validates it's a previous step.
   * If not provided, returns to the step before the current one.
   */
  async returnStep(input: {
    instanceId: string;
    stepId: string;
    actorUserId: string;
    comment: string;
    returnToStepId?: string;
  }) {
    const { instanceId, stepId, actorUserId, comment, returnToStepId } = input;

    if (!comment || comment.trim().length === 0) {
      throw new Error('Comment is required for return.');
    }

    const instance = await getInstanceWithTemplate(instanceId);

    if (instance.status !== 'in_progress') {
      throw new InvalidInstanceStatusError(
        instanceId,
        instance.status,
        ['in_progress'],
      );
    }

    if (instance.currentStepId !== stepId) {
      throw new StepMismatchError(instanceId, stepId, instance.currentStepId);
    }

    const currentStep = findCurrentStep(instance);
    if (!currentStep) {
      throw new Error(`Current step not found in template.`);
    }

    // Validate approver
    const approverRule = currentStep.approverRuleJson as any;
    const valid = await isValidApprover(actorUserId, approverRule, instance.projectId);
    if (!valid) {
      throw new NotAValidApproverError(actorUserId, stepId);
    }

    // Determine the return-to step
    let targetStep;
    if (returnToStepId) {
      targetStep = instance.template.steps.find(
        (s) => s.id === returnToStepId && s.orderIndex < currentStep.orderIndex,
      );
      if (!targetStep) {
        throw new InvalidReturnStepError(returnToStepId);
      }
    } else {
      // Return to the step before current
      const previousSteps = instance.template.steps.filter(
        (s) => s.orderIndex < currentStep.orderIndex,
      );
      targetStep = previousSteps[previousSteps.length - 1];
      if (!targetStep) {
        throw new Error('No previous step to return to.');
      }
    }

    const now = new Date();

    const result = await (prisma as any).$transaction(async (tx: any) => {
      // Write WorkflowAction (Task 1.5.5)
      await tx.workflowAction.create({
        data: {
          instanceId,
          stepId,
          actorUserId,
          action: 'returned',
          comment,
          actedAt: now,
          metadataJson: { returnToStepId: targetStep!.id } as any,
        },
      });

      // Update instance
      const updated = await tx.workflowInstance.update({
        where: { id: instanceId },
        data: {
          currentStepId: targetStep!.id,
          status: 'returned',
        },
      });

      // Audit log (Task 1.5.5)
      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: 'workflow.step_returned',
          resourceType: 'workflow_instance',
          resourceId: instanceId,
          projectId: instance.projectId,
          beforeJson: {
            currentStep: currentStep.name,
            status: instance.status,
          },
          afterJson: {
            currentStep: targetStep!.name,
            status: 'returned',
          },
          reason: comment,
        },
        tx,
      );

      return updated;
    });

    // Publish event
    await workflowEvents.emit('workflow.returned', {
      instanceId,
      templateCode: instance.template.code,
      recordType: instance.recordType,
      recordId: instance.recordId,
      projectId: instance.projectId,
      actorUserId,
      stepName: currentStep.name,
      comment,
    });

    return result;
  },

  /**
   * Cancel a workflow instance. Reason is required.
   */
  async cancelInstance(input: {
    instanceId: string;
    actorUserId: string;
    reason: string;
  }) {
    const { instanceId, actorUserId, reason } = input;

    if (!reason || reason.trim().length === 0) {
      throw new Error('Reason is required for cancellation.');
    }

    const instance = await getInstanceWithTemplate(instanceId);

    if (!['in_progress', 'returned'].includes(instance.status)) {
      throw new InvalidInstanceStatusError(
        instanceId,
        instance.status,
        ['in_progress', 'returned'],
      );
    }

    const currentStep = findCurrentStep(instance);
    const now = new Date();

    const result = await (prisma as any).$transaction(async (tx: any) => {
      // Write WorkflowAction (Task 1.5.5)
      await tx.workflowAction.create({
        data: {
          instanceId,
          stepId: instance.currentStepId!,
          actorUserId,
          action: 'cancelled',
          comment: reason,
          actedAt: now,
        },
      });

      // Update instance
      const updated = await tx.workflowInstance.update({
        where: { id: instanceId },
        data: {
          status: 'cancelled',
          completedAt: now,
        },
      });

      // Audit log (Task 1.5.5)
      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: 'workflow.instance_cancelled',
          resourceType: 'workflow_instance',
          resourceId: instanceId,
          projectId: instance.projectId,
          beforeJson: {
            currentStep: currentStep?.name ?? null,
            status: instance.status,
          },
          afterJson: {
            status: 'cancelled',
          },
          reason,
        },
        tx,
      );

      return updated;
    });

    // Publish event
    await workflowEvents.emit('workflow.cancelled', {
      instanceId,
      templateCode: instance.template.code,
      recordType: instance.recordType,
      recordId: instance.recordId,
      projectId: instance.projectId,
      actorUserId,
      stepName: currentStep?.name,
      comment: reason,
    });

    return result;
  },
};
