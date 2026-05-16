/**
 * Workflow event handlers for notifications — Task 1.8.6
 *
 * Registers handlers on the workflow event bus that fan-out notifications
 * to the appropriate recipients based on the event type.
 *
 * Call `registerWorkflowNotificationHandlers()` once during app initialization.
 *
 * Event → notification mappings:
 *  - workflow.started      → notify approvers of the FIRST step
 *  - workflow.stepApproved → notify approvers of the NEXT step
 *  - workflow.approved     → notify the workflow starter
 *  - workflow.rejected     → notify the workflow starter
 *  - workflow.returned     → notify the workflow starter + previous step approver
 *
 * Posting exception → notify all master_admin users.
 */

import { prisma } from '@fmksa/db';
import * as workflowEvents from '../workflow/events';
import type { WorkflowEventPayload } from '@fmksa/contracts';
import { notify } from './service';
import { resolveApprovers } from '../workflow/approver-resolution';
import { registerConvergenceHandlers } from '../workflow/convergence-handlers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load a workflow instance with its template, steps, and actions.
 */
async function loadInstance(instanceId: string) {
  return (prisma as any).workflowInstance.findUnique({
    where: { id: instanceId },
    include: {
      template: {
        include: {
          steps: { orderBy: { orderIndex: 'asc' } },
        },
      },
      actions: {
        orderBy: { actedAt: 'asc' },
      },
    },
  });
}

/**
 * Build a recipient list from an array of user IDs.
 */
async function buildRecipients(
  userIds: string[],
): Promise<Array<{ id: string; name?: string }>> {
  if (userIds.length === 0) return [];
  const users = await (prisma as any).user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  return users as Array<{ id: string; name: string }>;
}

// ---------------------------------------------------------------------------
// Handler: workflow.started → notify first step approvers
// ---------------------------------------------------------------------------
//
// Without this handler, the first approver in the chain has no idea a record
// is waiting for them until they happen to open the My Approvals page. That
// is the exact "approvals by email/WhatsApp chase" behavior the system is
// trying to eliminate. This handler closes the gap.

async function handleWorkflowStarted(payload: WorkflowEventPayload): Promise<void> {
  const { instanceId, projectId, recordType, recordId } = payload;

  const instance = await loadInstance(instanceId);
  if (!instance) return;

  const currentStepId = instance.currentStepId as string | null;
  if (!currentStepId) return; // no first step resolved — nothing to notify

  const steps = instance.template.steps as Array<{
    id: string;
    name: string;
    orderIndex: number;
    approverRuleJson: unknown;
  }>;

  const currentStep = steps.find((s) => s.id === currentStepId);
  if (!currentStep) return;

  let approverIds: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    approverIds = await resolveApprovers(
      currentStep.approverRuleJson as any,
      projectId,
    );
  } catch {
    // If we can't resolve approvers, skip the notification silently.
    // The My Approvals query applies the same filter, so users will still
    // see the work when they check — they just won't get a push notification.
    return;
  }

  const recipients = await buildRecipients(approverIds);
  if (recipients.length === 0) return;

  await notify({
    templateCode: 'workflow_step_assigned',
    recipients,
    payload: {
      stepName: currentStep.name,
      recordType,
      recordRef: recordId,
      projectName: projectId, // real name resolved in later phase
    },
    idempotencyKey: `workflow.started:${instanceId}:${currentStepId}`,
    channels: ['in_app', 'email'],
  });
}

// ---------------------------------------------------------------------------
// Handler: workflow.stepApproved → notify next step approvers
// ---------------------------------------------------------------------------

async function handleStepApproved(payload: WorkflowEventPayload): Promise<void> {
  const { instanceId, projectId, recordType, recordId } = payload;

  const instance = await loadInstance(instanceId);
  if (!instance) return;

  const currentStepId = instance.currentStepId as string | null;
  if (!currentStepId) return; // workflow completed — handled by .approved

  const steps = instance.template.steps as Array<{
    id: string;
    name: string;
    orderIndex: number;
    approverRuleJson: unknown;
  }>;

  const currentStep = steps.find((s) => s.id === currentStepId);
  if (!currentStep) return;

  let approverIds: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    approverIds = await resolveApprovers(
      currentStep.approverRuleJson as any,
      projectId,
    );
  } catch {
    // If we can't resolve approvers, skip the notification silently
    return;
  }

  const recipients = await buildRecipients(approverIds);
  if (recipients.length === 0) return;

  await notify({
    templateCode: 'workflow_step_assigned',
    recipients,
    payload: {
      stepName: currentStep.name,
      recordType,
      recordRef: recordId,
      projectName: projectId, // real name resolved in later phase
    },
    idempotencyKey: `workflow.stepApproved:${instanceId}:${currentStepId}`,
    channels: ['in_app', 'email'],
  });
}

// ---------------------------------------------------------------------------
// Handler: workflow.approved → notify the workflow starter
// ---------------------------------------------------------------------------

async function handleWorkflowApproved(payload: WorkflowEventPayload): Promise<void> {
  const { instanceId, recordType, recordId } = payload;

  const instance = await loadInstance(instanceId);
  if (!instance) return;

  const startedBy = instance.startedBy as string;
  const recipients = await buildRecipients([startedBy]);
  if (recipients.length === 0) return;

  await notify({
    templateCode: 'workflow_approved',
    recipients,
    payload: {
      recordType,
      recordRef: recordId,
      actorName: payload.actorUserId,
      projectName: payload.projectId,
    },
    idempotencyKey: `workflow.approved:${instanceId}:final`,
    channels: ['in_app', 'email'],
  });
}

// ---------------------------------------------------------------------------
// Handler: workflow.rejected → notify the workflow starter
// ---------------------------------------------------------------------------

async function handleWorkflowRejected(payload: WorkflowEventPayload): Promise<void> {
  const { instanceId, recordType, recordId, comment } = payload;

  const instance = await loadInstance(instanceId);
  if (!instance) return;

  const startedBy = instance.startedBy as string;
  const recipients = await buildRecipients([startedBy]);
  if (recipients.length === 0) return;

  await notify({
    templateCode: 'workflow_rejected',
    recipients,
    payload: {
      recordType,
      recordRef: recordId,
      actorName: payload.actorUserId,
      projectName: payload.projectId,
      comment: comment ?? '',
    },
    idempotencyKey: `workflow.rejected:${instanceId}:final`,
    channels: ['in_app', 'email'],
  });
}

// ---------------------------------------------------------------------------
// Handler: workflow.returned → notify starter + previous step approver
// ---------------------------------------------------------------------------

async function handleWorkflowReturned(payload: WorkflowEventPayload): Promise<void> {
  const { instanceId, recordType, recordId, actorUserId, comment } = payload;

  const instance = await loadInstance(instanceId);
  if (!instance) return;

  const startedBy = instance.startedBy as string;

  // The actor who returned the workflow is the previous step approver
  const recipientIds = [...new Set([startedBy, actorUserId])];
  const recipients = await buildRecipients(recipientIds);
  if (recipients.length === 0) return;

  await notify({
    templateCode: 'workflow_returned',
    recipients,
    payload: {
      recordType,
      recordRef: recordId,
      actorName: actorUserId,
      projectName: payload.projectId,
      comment: comment ?? '',
    },
    idempotencyKey: `workflow.returned:${instanceId}:final`,
    channels: ['in_app', 'email'],
  });
}

// ---------------------------------------------------------------------------
// Posting exception handler
// ---------------------------------------------------------------------------

/**
 * Notify all users with role `master_admin` when a posting exception occurs.
 *
 * @param eventType  - The posting event type string.
 * @param eventId    - The posting event ID (used as idempotency key).
 */
export async function notifyPostingException(
  eventType: string,
  eventId: string,
  projectId?: string,
  reason?: string,
): Promise<void> {
  // Find all master_admin users (active UserRole → active User)
  const now = new Date();
  const masterAdminRoles = await (prisma as any).role.findMany({
    where: { code: 'master_admin' },
    select: { id: true },
  });

  if (masterAdminRoles.length === 0) return;

  const roleId = (masterAdminRoles[0] as { id: string }).id;

  const userRoles = await (prisma as any).userRole.findMany({
    where: {
      roleId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    include: {
      user: { select: { id: true, name: true, status: true } },
    },
  });

  const recipients = (
    userRoles as Array<{ user: { id: string; name: string; status: string } }>
  )
    .filter((ur) => ur.user.status === 'active')
    .map((ur) => ({ id: ur.user.id, name: ur.user.name }));

  if (recipients.length === 0) return;

  await notify({
    templateCode: 'posting_exception',
    recipients,
    payload: {
      eventType,
      projectName: projectId ?? 'Unknown',
      reason: reason ?? 'See posting exceptions queue',
    },
    idempotencyKey: `posting.exception:${eventId}`,
    channels: ['in_app', 'email'],
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let notificationHandlersRegistered = false;

/**
 * Register all workflow notification handlers on the event bus.
 *
 * Call once during application initialization.
 * Idempotent — safe to call multiple times (e.g. Next.js HMR re-evaluation).
 * Call `workflowEvents.clearHandlers()` before calling this in tests.
 */
export function registerWorkflowNotificationHandlers(): void {
  if (notificationHandlersRegistered) return;
  notificationHandlersRegistered = true;

  // Convergence handlers FIRST — record status must be synced before
  // notifications reference the record. (Event bus executes in registration order.)
  registerConvergenceHandlers();

  workflowEvents.on('workflow.started', handleWorkflowStarted);
  workflowEvents.on('workflow.stepApproved', handleStepApproved);
  workflowEvents.on('workflow.approved', handleWorkflowApproved);
  workflowEvents.on('workflow.rejected', handleWorkflowRejected);
  workflowEvents.on('workflow.returned', handleWorkflowReturned);
}
