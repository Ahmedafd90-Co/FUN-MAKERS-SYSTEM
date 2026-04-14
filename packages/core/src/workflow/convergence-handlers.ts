/**
 * Workflow → Record convergence handlers.
 *
 * Subscribes to workflow events and synchronizes the parent record's status:
 *   workflow.approved  → record moves to 'approved_internal'
 *   workflow.rejected  → record moves to 'rejected'
 *   workflow.returned  → record moves to 'returned'
 *
 * These handlers run OUTSIDE the normal record transition service to avoid:
 *   - Recursive workflow starts (transition service starts workflows on submit)
 *   - Posting events being duplicated (handler fires posting explicitly for IPA)
 *   - Validation loops (transition service checks workflow guards)
 *
 * Audit logs include full workflow provenance:
 *   - actorSource = 'system'
 *   - workflow instance ID, template code, step name, action context
 *
 * Supported record types: 'ipa', 'ipc', 'rfq', 'variation', 'correspondence'.
 *
 * Call registerConvergenceHandlers() once during app initialization.
 */

import { prisma } from '@fmksa/db';
import type { IpaStatus, IpcStatus, CorrespondenceStatus } from '@fmksa/db';
import type { WorkflowEventPayload } from '@fmksa/contracts';
import * as workflowEvents from './events';
import { auditService } from '../audit/service';
import { postingService } from '../posting/service';

// ---------------------------------------------------------------------------
// Type registry — which record types have convergence wired
// ---------------------------------------------------------------------------

const CONVERGENCE_RECORD_TYPES = ['ipa', 'ipc', 'rfq', 'variation', 'correspondence'] as const;

function isConvergenceWired(recordType: string): boolean {
  return (CONVERGENCE_RECORD_TYPES as readonly string[]).includes(recordType);
}

// ---------------------------------------------------------------------------
// Helper — load workflow instance with current step context
// ---------------------------------------------------------------------------

async function loadInstanceContext(instanceId: string) {
  return prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: {
      template: {
        include: { steps: { orderBy: { orderIndex: 'asc' } } },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// IPA convergence
// ---------------------------------------------------------------------------

async function handleIpaApproved(payload: WorkflowEventPayload): Promise<void> {
  const ipa = await prisma.ipa.findUnique({
    where: { id: payload.recordId },
    include: { project: true },
  });
  if (!ipa) return;
  if (ipa.status === 'approved_internal') return; // already converged (idempotent)

  const beforeStatus = ipa.status;

  // Update record status
  const updated = await prisma.ipa.update({
    where: { id: payload.recordId },
    data: { status: 'approved_internal' as IpaStatus },
  });

  // Audit with workflow provenance
  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'ipa.transition.workflow_approved',
    resourceType: 'ipa',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'approved_internal',
      _convergence: {
        trigger: 'workflow.approved',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        finalStepApprovedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow approval complete (instance: ${payload.instanceId}, template: ${payload.templateCode})`,
  });

  // Fire the IPA_APPROVED posting event — this is a financial invariant.
  // Same payload as manual approval in ipa/service.ts.
  await postingService.post({
    eventType: 'IPA_APPROVED',
    sourceService: 'commercial',
    sourceRecordType: 'ipa',
    sourceRecordId: ipa.id,
    projectId: ipa.projectId,
    entityId: ipa.project.entityId,
    idempotencyKey: `ipa:${ipa.id}:approved_internal`,
    payload: {
      ipaId: ipa.id,
      periodNumber: ipa.periodNumber,
      grossAmount: ipa.grossAmount.toString(),
      retentionAmount: ipa.retentionAmount.toString(),
      netClaimed: ipa.netClaimed.toString(),
      currency: ipa.currency,
      projectId: ipa.projectId,
    },
    actorUserId: payload.actorUserId,
  });

  console.log(
    `[convergence] IPA ${payload.recordId}: ${beforeStatus} → approved_internal (workflow ${payload.instanceId})`,
  );
}

async function handleIpaReturned(payload: WorkflowEventPayload): Promise<void> {
  const ipa = await prisma.ipa.findUnique({ where: { id: payload.recordId } });
  if (!ipa) return;
  if (ipa.status === 'returned') return; // idempotent

  const beforeStatus = ipa.status;

  // Load instance for return-to step context
  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.ipa.update({
    where: { id: payload.recordId },
    data: { status: 'returned' as IpaStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'ipa.transition.workflow_returned',
    resourceType: 'ipa',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'returned',
      _convergence: {
        trigger: 'workflow.returned',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        returnedByStep: payload.stepName ?? null,
        returnedToStep: returnToStep?.name ?? null,
        returnedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow returned at step "${payload.stepName}" → "${returnToStep?.name ?? 'unknown'}" (instance: ${payload.instanceId})`,
  });

  console.log(
    `[convergence] IPA ${payload.recordId}: ${beforeStatus} → returned (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handleIpaRejected(payload: WorkflowEventPayload): Promise<void> {
  const ipa = await prisma.ipa.findUnique({ where: { id: payload.recordId } });
  if (!ipa) return;
  if (ipa.status === 'rejected') return; // idempotent

  const beforeStatus = ipa.status;

  await prisma.ipa.update({
    where: { id: payload.recordId },
    data: { status: 'rejected' as IpaStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'ipa.transition.workflow_rejected',
    resourceType: 'ipa',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'rejected',
      _convergence: {
        trigger: 'workflow.rejected',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        rejectedAtStep: payload.stepName ?? null,
        rejectedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow rejected at step "${payload.stepName}" (instance: ${payload.instanceId}): ${payload.comment ?? 'no comment'}`,
  });

  console.log(
    `[convergence] IPA ${payload.recordId}: ${beforeStatus} → rejected (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// IPC convergence
// ---------------------------------------------------------------------------

async function handleIpcApproved(payload: WorkflowEventPayload): Promise<void> {
  const ipc = await prisma.ipc.findUnique({ where: { id: payload.recordId } });
  if (!ipc) return;
  if (ipc.status === 'approved_internal') return; // already converged (idempotent)

  const beforeStatus = ipc.status;

  await prisma.ipc.update({
    where: { id: payload.recordId },
    data: { status: 'approved_internal' as IpcStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'ipc.transition.workflow_approved',
    resourceType: 'ipc',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'approved_internal',
      _convergence: {
        trigger: 'workflow.approved',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        finalStepApprovedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow approval complete (instance: ${payload.instanceId}, template: ${payload.templateCode})`,
  });

  // No posting event at approved_internal — IPC_SIGNED fires at the 'sign' step,
  // which is a manual transition after workflow-managed approval phase.
  console.log(
    `[convergence] IPC ${payload.recordId}: ${beforeStatus} → approved_internal (workflow ${payload.instanceId})`,
  );
}

async function handleIpcReturned(payload: WorkflowEventPayload): Promise<void> {
  const ipc = await prisma.ipc.findUnique({ where: { id: payload.recordId } });
  if (!ipc) return;
  if (ipc.status === 'returned') return; // idempotent

  const beforeStatus = ipc.status;

  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.ipc.update({
    where: { id: payload.recordId },
    data: { status: 'returned' as IpcStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'ipc.transition.workflow_returned',
    resourceType: 'ipc',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'returned',
      _convergence: {
        trigger: 'workflow.returned',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        returnedByStep: payload.stepName ?? null,
        returnedToStep: returnToStep?.name ?? null,
        returnedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow returned at step "${payload.stepName}" → "${returnToStep?.name ?? 'unknown'}" (instance: ${payload.instanceId})`,
  });

  console.log(
    `[convergence] IPC ${payload.recordId}: ${beforeStatus} → returned (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handleIpcRejected(payload: WorkflowEventPayload): Promise<void> {
  const ipc = await prisma.ipc.findUnique({ where: { id: payload.recordId } });
  if (!ipc) return;
  if (ipc.status === 'rejected') return; // idempotent

  const beforeStatus = ipc.status;

  await prisma.ipc.update({
    where: { id: payload.recordId },
    data: { status: 'rejected' as IpcStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'ipc.transition.workflow_rejected',
    resourceType: 'ipc',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'rejected',
      _convergence: {
        trigger: 'workflow.rejected',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        rejectedAtStep: payload.stepName ?? null,
        rejectedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow rejected at step "${payload.stepName}" (instance: ${payload.instanceId}): ${payload.comment ?? 'no comment'}`,
  });

  console.log(
    `[convergence] IPC ${payload.recordId}: ${beforeStatus} → rejected (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// RFQ convergence
// ---------------------------------------------------------------------------

async function handleRfqApproved(payload: WorkflowEventPayload): Promise<void> {
  const rfq = await prisma.rFQ.findUnique({ where: { id: payload.recordId } });
  if (!rfq) return;
  if (rfq.status === 'approved_internal') return; // idempotent

  const beforeStatus = rfq.status;

  await prisma.rFQ.update({
    where: { id: payload.recordId },
    data: { status: 'approved_internal' },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'rfq.transition.workflow_approved',
    resourceType: 'rfq',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'approved_internal',
      _convergence: {
        trigger: 'workflow.approved',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        finalStepApprovedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow approval complete (instance: ${payload.instanceId}, template: ${payload.templateCode})`,
  });

  console.log(
    `[convergence] RFQ ${payload.recordId}: ${beforeStatus} → approved_internal (workflow ${payload.instanceId})`,
  );
}

async function handleRfqReturned(payload: WorkflowEventPayload): Promise<void> {
  const rfq = await prisma.rFQ.findUnique({ where: { id: payload.recordId } });
  if (!rfq) return;
  if (rfq.status === 'returned') return; // idempotent

  const beforeStatus = rfq.status;

  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.rFQ.update({
    where: { id: payload.recordId },
    data: { status: 'returned' },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'rfq.transition.workflow_returned',
    resourceType: 'rfq',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'returned',
      _convergence: {
        trigger: 'workflow.returned',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        returnedByStep: payload.stepName ?? null,
        returnedToStep: returnToStep?.name ?? null,
        returnedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow returned at step "${payload.stepName}" → "${returnToStep?.name ?? 'unknown'}" (instance: ${payload.instanceId})`,
  });

  console.log(
    `[convergence] RFQ ${payload.recordId}: ${beforeStatus} → returned (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handleRfqRejected(payload: WorkflowEventPayload): Promise<void> {
  const rfq = await prisma.rFQ.findUnique({ where: { id: payload.recordId } });
  if (!rfq) return;
  if (rfq.status === 'rejected') return; // idempotent

  const beforeStatus = rfq.status;

  await prisma.rFQ.update({
    where: { id: payload.recordId },
    data: { status: 'rejected' },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'rfq.transition.workflow_rejected',
    resourceType: 'rfq',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'rejected',
      _convergence: {
        trigger: 'workflow.rejected',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        rejectedAtStep: payload.stepName ?? null,
        rejectedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow rejected at step "${payload.stepName}" (instance: ${payload.instanceId}): ${payload.comment ?? 'no comment'}`,
  });

  console.log(
    `[convergence] RFQ ${payload.recordId}: ${beforeStatus} → rejected (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// Variation convergence
// ---------------------------------------------------------------------------

async function handleVariationApproved(payload: WorkflowEventPayload): Promise<void> {
  const variation = await prisma.variation.findUnique({
    where: { id: payload.recordId },
    include: { project: true },
  });
  if (!variation) return;
  if (variation.status === 'approved_internal') return; // idempotent

  const beforeStatus = variation.status;

  await prisma.variation.update({
    where: { id: payload.recordId },
    data: { status: 'approved_internal' },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'variation.transition.workflow_approved',
    resourceType: 'variation',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'approved_internal',
      _convergence: {
        trigger: 'workflow.approved',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        finalStepApprovedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow approval complete (instance: ${payload.instanceId}, template: ${payload.templateCode})`,
  });

  // Fire VARIATION_APPROVED_INTERNAL posting event — financial invariant
  await postingService.post({
    eventType: 'VARIATION_APPROVED_INTERNAL',
    sourceService: 'commercial',
    sourceRecordType: 'variation',
    sourceRecordId: variation.id,
    projectId: variation.projectId,
    entityId: variation.project.entityId,
    idempotencyKey: `variation:${variation.id}:approved_internal`,
    payload: {
      variationId: variation.id,
      subtype: variation.subtype,
      title: variation.title,
      costImpact: variation.costImpact?.toString() ?? null,
      timeImpactDays: variation.timeImpactDays ?? null,
      currency: variation.currency,
      projectId: variation.projectId,
    },
    actorUserId: payload.actorUserId,
  });

  console.log(
    `[convergence] Variation ${payload.recordId}: ${beforeStatus} → approved_internal (workflow ${payload.instanceId})`,
  );
}

async function handleVariationReturned(payload: WorkflowEventPayload): Promise<void> {
  const variation = await prisma.variation.findUnique({ where: { id: payload.recordId } });
  if (!variation) return;
  if (variation.status === 'returned') return; // idempotent

  const beforeStatus = variation.status;

  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.variation.update({
    where: { id: payload.recordId },
    data: { status: 'returned' },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'variation.transition.workflow_returned',
    resourceType: 'variation',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'returned',
      _convergence: {
        trigger: 'workflow.returned',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        returnedByStep: payload.stepName ?? null,
        returnedToStep: returnToStep?.name ?? null,
        returnedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow returned at step "${payload.stepName}" → "${returnToStep?.name ?? 'unknown'}" (instance: ${payload.instanceId})`,
  });

  console.log(
    `[convergence] Variation ${payload.recordId}: ${beforeStatus} → returned (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handleVariationRejected(payload: WorkflowEventPayload): Promise<void> {
  const variation = await prisma.variation.findUnique({ where: { id: payload.recordId } });
  if (!variation) return;
  if (variation.status === 'rejected') return; // idempotent

  const beforeStatus = variation.status;

  await prisma.variation.update({
    where: { id: payload.recordId },
    data: { status: 'rejected' },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'variation.transition.workflow_rejected',
    resourceType: 'variation',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'rejected',
      _convergence: {
        trigger: 'workflow.rejected',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        rejectedAtStep: payload.stepName ?? null,
        rejectedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow rejected at step "${payload.stepName}" (instance: ${payload.instanceId}): ${payload.comment ?? 'no comment'}`,
  });

  console.log(
    `[convergence] Variation ${payload.recordId}: ${beforeStatus} → rejected (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// Correspondence convergence
// ---------------------------------------------------------------------------

async function handleCorrespondenceApproved(payload: WorkflowEventPayload): Promise<void> {
  const correspondence = await prisma.correspondence.findUnique({ where: { id: payload.recordId } });
  if (!correspondence) return;
  if (correspondence.status === 'approved_internal') return; // already converged (idempotent)

  const beforeStatus = correspondence.status;

  await prisma.correspondence.update({
    where: { id: payload.recordId },
    data: { status: 'approved_internal' as CorrespondenceStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'correspondence.transition.workflow_approved',
    resourceType: 'correspondence',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'approved_internal',
      _convergence: {
        trigger: 'workflow.approved',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        finalStepApprovedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow approval complete (instance: ${payload.instanceId}, template: ${payload.templateCode})`,
  });

  // No posting event at approved_internal — CLAIM_ISSUED / BACK_CHARGE_ISSUED
  // fire at the manual 'issue' transition, after sign (if present).
  console.log(
    `[convergence] Correspondence ${payload.recordId}: ${beforeStatus} → approved_internal (workflow ${payload.instanceId})`,
  );
}

async function handleCorrespondenceReturned(payload: WorkflowEventPayload): Promise<void> {
  const correspondence = await prisma.correspondence.findUnique({ where: { id: payload.recordId } });
  if (!correspondence) return;
  if (correspondence.status === 'returned') return; // idempotent

  const beforeStatus = correspondence.status;

  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.correspondence.update({
    where: { id: payload.recordId },
    data: { status: 'returned' as CorrespondenceStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'correspondence.transition.workflow_returned',
    resourceType: 'correspondence',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'returned',
      _convergence: {
        trigger: 'workflow.returned',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        returnedByStep: payload.stepName ?? null,
        returnedToStep: returnToStep?.name ?? null,
        returnedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow returned at step "${payload.stepName}" → "${returnToStep?.name ?? 'unknown'}" (instance: ${payload.instanceId})`,
  });

  console.log(
    `[convergence] Correspondence ${payload.recordId}: ${beforeStatus} → returned (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handleCorrespondenceRejected(payload: WorkflowEventPayload): Promise<void> {
  const correspondence = await prisma.correspondence.findUnique({ where: { id: payload.recordId } });
  if (!correspondence) return;
  if (correspondence.status === 'rejected') return; // idempotent

  const beforeStatus = correspondence.status;

  await prisma.correspondence.update({
    where: { id: payload.recordId },
    data: { status: 'rejected' as CorrespondenceStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'correspondence.transition.workflow_rejected',
    resourceType: 'correspondence',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'rejected',
      _convergence: {
        trigger: 'workflow.rejected',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        rejectedAtStep: payload.stepName ?? null,
        rejectedBy: payload.actorUserId,
        comment: payload.comment ?? null,
      },
    },
    reason: `Workflow rejected at step "${payload.stepName}" (instance: ${payload.instanceId}): ${payload.comment ?? 'no comment'}`,
  });

  console.log(
    `[convergence] Correspondence ${payload.recordId}: ${beforeStatus} → rejected (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// Event dispatchers
// ---------------------------------------------------------------------------

async function onWorkflowApproved(payload: WorkflowEventPayload): Promise<void> {
  if (!isConvergenceWired(payload.recordType)) return;

  if (payload.recordType === 'ipa') return handleIpaApproved(payload);
  if (payload.recordType === 'ipc') return handleIpcApproved(payload);
  if (payload.recordType === 'rfq') return handleRfqApproved(payload);
  if (payload.recordType === 'variation') return handleVariationApproved(payload);
  if (payload.recordType === 'correspondence') return handleCorrespondenceApproved(payload);
}

async function onWorkflowReturned(payload: WorkflowEventPayload): Promise<void> {
  if (!isConvergenceWired(payload.recordType)) return;

  if (payload.recordType === 'ipa') return handleIpaReturned(payload);
  if (payload.recordType === 'ipc') return handleIpcReturned(payload);
  if (payload.recordType === 'rfq') return handleRfqReturned(payload);
  if (payload.recordType === 'variation') return handleVariationReturned(payload);
  if (payload.recordType === 'correspondence') return handleCorrespondenceReturned(payload);
}

async function onWorkflowRejected(payload: WorkflowEventPayload): Promise<void> {
  if (!isConvergenceWired(payload.recordType)) return;

  if (payload.recordType === 'ipa') return handleIpaRejected(payload);
  if (payload.recordType === 'ipc') return handleIpcRejected(payload);
  if (payload.recordType === 'rfq') return handleRfqRejected(payload);
  if (payload.recordType === 'variation') return handleVariationRejected(payload);
  if (payload.recordType === 'correspondence') return handleCorrespondenceRejected(payload);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let convergenceRegistered = false;

/**
 * Register convergence handlers on the workflow event bus.
 *
 * Call once during application initialization, alongside notification handlers.
 * Idempotent — safe to call multiple times (e.g. Next.js HMR re-evaluation).
 *
 * Convergence handlers run BEFORE notification handlers on the same event
 * (registration order = execution order in the sequential event bus).
 */
export function registerConvergenceHandlers(): void {
  if (convergenceRegistered) return;
  convergenceRegistered = true;

  workflowEvents.on('workflow.approved', onWorkflowApproved);
  workflowEvents.on('workflow.returned', onWorkflowReturned);
  workflowEvents.on('workflow.rejected', onWorkflowRejected);
}
