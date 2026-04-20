/**
 * Workflow event handlers for notifications — Task 1.8.6
 *
 * Registers handlers on the workflow event bus that fan-out notifications
 * to the appropriate recipients based on the event type.
 *
 * Call `registerWorkflowNotificationHandlers()` once during app initialization.
 *
 * Event → notification mappings:
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
 * Load a workflow instance with its template, steps, actions, and project.
 * Project is included so notification payloads can carry the real project
 * name/code rather than the project UUID.
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
      project: {
        select: { id: true, code: true, name: true },
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

/**
 * Fetch the human name for an actor user ID. Returns null if the user
 * cannot be found (deleted / orphaned action).
 */
async function resolveActorName(userId: string): Promise<string | null> {
  const user = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  return (user?.name as string | null) ?? null;
}

/**
 * Map a workflow recordType to a human-readable label used in notification
 * subjects/bodies. Kept in sync with the same label table in
 * apps/web/components/approvals/approval-list.tsx.
 */
const RECORD_TYPE_LABELS: Record<string, string> = {
  cost_proposal: 'Cost Proposal',
  variation: 'Variation',
  ipa: 'IPA',
  ipc: 'IPC',
  tax_invoice: 'Tax Invoice',
  correspondence: 'Correspondence',
  engineer_instruction: 'Engineer Instruction',
  rfq: 'RFQ',
  quotation: 'Quotation',
  purchase_order: 'Purchase Order',
  supplier_invoice: 'Supplier Invoice',
  expense: 'Expense',
  credit_note: 'Credit Note',
  vendor_contract: 'Vendor Contract',
  framework_agreement: 'Framework Agreement',
};

function humanizeRecordType(recordType: string): string {
  return RECORD_TYPE_LABELS[recordType] ?? recordType;
}

/**
 * Resolve the human-readable reference number for a record by type.
 * Returns null when the record has no reference field populated (e.g.
 * still in draft) so callers can fall back to a short ID.
 */
async function resolveRecordRef(
  recordType: string,
  recordId: string,
): Promise<string | null> {
  try {
    switch (recordType) {
      case 'cost_proposal': {
        const r = await (prisma as any).costProposal.findUnique({
          where: { id: recordId },
          select: { referenceNumber: true },
        });
        return r?.referenceNumber ?? null;
      }
      case 'variation': {
        const r = await (prisma as any).variation.findUnique({
          where: { id: recordId },
          select: { referenceNumber: true, title: true },
        });
        return r?.referenceNumber ?? r?.title ?? null;
      }
      case 'ipa': {
        const r = await (prisma as any).ipa.findUnique({
          where: { id: recordId },
          select: { referenceNumber: true },
        });
        return r?.referenceNumber ?? null;
      }
      case 'ipc': {
        const r = await (prisma as any).ipc.findUnique({
          where: { id: recordId },
          select: { referenceNumber: true },
        });
        return r?.referenceNumber ?? null;
      }
      case 'tax_invoice': {
        const r = await (prisma as any).taxInvoice.findUnique({
          where: { id: recordId },
          select: { referenceNumber: true, invoiceNumber: true },
        });
        return r?.referenceNumber ?? r?.invoiceNumber ?? null;
      }
      case 'correspondence': {
        const r = await (prisma as any).correspondence.findUnique({
          where: { id: recordId },
          select: { referenceNumber: true, subject: true },
        });
        return r?.referenceNumber ?? r?.subject ?? null;
      }
      case 'engineer_instruction': {
        const r = await (prisma as any).engineerInstruction.findUnique({
          where: { id: recordId },
          select: { referenceNumber: true, title: true },
        });
        return r?.referenceNumber ?? r?.title ?? null;
      }
      case 'rfq': {
        const r = await (prisma as any).rFQ.findUnique({
          where: { id: recordId },
          select: { referenceNumber: true, rfqNumber: true },
        });
        return r?.referenceNumber ?? r?.rfqNumber ?? null;
      }
      case 'quotation': {
        const r = await (prisma as any).quotation.findUnique({
          where: { id: recordId },
          select: { quotationRef: true },
        });
        return r?.quotationRef ?? null;
      }
      case 'purchase_order': {
        const r = await (prisma as any).purchaseOrder.findUnique({
          where: { id: recordId },
          select: { referenceNumber: true, poNumber: true },
        });
        return r?.referenceNumber ?? r?.poNumber ?? null;
      }
      case 'supplier_invoice': {
        const r = await (prisma as any).supplierInvoice.findUnique({
          where: { id: recordId },
          select: { invoiceNumber: true },
        });
        return r?.invoiceNumber ?? null;
      }
      case 'expense': {
        const r = await (prisma as any).expense.findUnique({
          where: { id: recordId },
          select: { title: true },
        });
        return r?.title ?? null;
      }
      case 'credit_note': {
        const r = await (prisma as any).creditNote.findUnique({
          where: { id: recordId },
          select: { creditNoteNumber: true },
        });
        return r?.creditNoteNumber ?? null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
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

  const recordRef = (await resolveRecordRef(recordType, recordId)) ?? recordId.slice(0, 8);
  const project = instance.project as { id: string; code: string; name: string };

  await notify({
    templateCode: 'workflow_step_assigned',
    recipients,
    payload: {
      // Template vars — human-readable so rendered subject/body read cleanly
      stepName: currentStep.name,
      recordType: humanizeRecordType(recordType),
      recordRef,
      projectName: project.name,
      // Routing context — raw IDs consumed by the notifications UI to deep-link
      recordTypeCode: recordType,
      recordId,
      projectId: project.id,
      projectCode: project.code,
      instanceId,
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

  const [recordRef, actorName] = await Promise.all([
    resolveRecordRef(recordType, recordId),
    resolveActorName(payload.actorUserId),
  ]);
  const project = instance.project as { id: string; code: string; name: string };

  await notify({
    templateCode: 'workflow_approved',
    recipients,
    payload: {
      recordType: humanizeRecordType(recordType),
      recordRef: recordRef ?? recordId.slice(0, 8),
      actorName: actorName ?? 'an approver',
      projectName: project.name,
      recordTypeCode: recordType,
      recordId,
      projectId: project.id,
      projectCode: project.code,
      actorUserId: payload.actorUserId,
      instanceId,
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

  const [recordRef, actorName] = await Promise.all([
    resolveRecordRef(recordType, recordId),
    resolveActorName(payload.actorUserId),
  ]);
  const project = instance.project as { id: string; code: string; name: string };

  await notify({
    templateCode: 'workflow_rejected',
    recipients,
    payload: {
      recordType: humanizeRecordType(recordType),
      recordRef: recordRef ?? recordId.slice(0, 8),
      actorName: actorName ?? 'an approver',
      projectName: project.name,
      comment: comment ?? '',
      recordTypeCode: recordType,
      recordId,
      projectId: project.id,
      projectCode: project.code,
      actorUserId: payload.actorUserId,
      instanceId,
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

  const [recordRef, actorName] = await Promise.all([
    resolveRecordRef(recordType, recordId),
    resolveActorName(actorUserId),
  ]);
  const project = instance.project as { id: string; code: string; name: string };

  await notify({
    templateCode: 'workflow_returned',
    recipients,
    payload: {
      recordType: humanizeRecordType(recordType),
      recordRef: recordRef ?? recordId.slice(0, 8),
      actorName: actorName ?? 'an approver',
      projectName: project.name,
      comment: comment ?? '',
      recordTypeCode: recordType,
      recordId,
      projectId: project.id,
      projectCode: project.code,
      actorUserId,
      instanceId,
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

  // Resolve the human project name if we have a projectId; fall back to
  // "Unknown" otherwise. The raw id stays on the payload for any client that
  // wants to link to the project.
  let projectName = 'Unknown';
  if (projectId) {
    const project = await (prisma as any).project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    if (project?.name) projectName = project.name as string;
  }

  await notify({
    templateCode: 'posting_exception',
    recipients,
    payload: {
      eventType,
      projectName,
      reason: reason ?? 'See posting exceptions queue',
      projectId: projectId ?? null,
      postingEventId: eventId,
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

  workflowEvents.on('workflow.stepApproved', handleStepApproved);
  workflowEvents.on('workflow.approved', handleWorkflowApproved);
  workflowEvents.on('workflow.rejected', handleWorkflowRejected);
  workflowEvents.on('workflow.returned', handleWorkflowReturned);
}
