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
 * Supported record types: 'ipa', 'ipc', 'rfq', 'variation', 'correspondence',
 * 'purchase_order', 'supplier_invoice', 'expense'.
 *
 * Call registerConvergenceHandlers() once during app initialization.
 */

import { prisma, runAsWorkflowEngine } from '@fmksa/db';
import type {
  IpaStatus,
  IpcStatus,
  CorrespondenceStatus,
  PurchaseOrderStatus,
  SupplierInvoiceStatus,
  ExpenseStatus,
  CostProposalStatus,
  TaxInvoiceStatus,
  VendorContractStatus,
  FrameworkAgreementStatus,
  CreditNoteStatus,
} from '@fmksa/db';
import type { WorkflowEventPayload } from '@fmksa/contracts';
import * as workflowEvents from './events';
import { auditService } from '../audit/service';
import { postingService } from '../posting/service';
import { absorbPoCommitment, absorbSupplierInvoiceActual, absorbExpenseActual } from '../budget/absorption';

// ---------------------------------------------------------------------------
// Type registry — which record types have convergence wired
// ---------------------------------------------------------------------------

// PIC-35 Step 4: 5 manual-start entities added — cost_proposal, tax_invoice,
// vendor_contract, framework_agreement, credit_note. These previously had
// workflow templates but no convergence wiring; entity.status never updated
// on workflow.approved / .rejected / .returned. See per-section comments
// below for status-mapping divergences (tax_invoice and credit_note lack
// some workflow-canonical statuses in their enums).
const CONVERGENCE_RECORD_TYPES = [
  'ipa',
  'ipc',
  'rfq',
  'variation',
  'correspondence',
  'purchase_order',
  'supplier_invoice',
  'expense',
  'cost_proposal',
  'tax_invoice',
  'vendor_contract',
  'framework_agreement',
  'credit_note',
  // PIC-52 — Drawing Register (Layer 2.5 PR-3). On workflow.approved, the
  // handler atomically writes DrawingRevision.status='for_construction' AND
  // Drawing.currentRevisionId AND supersedes any previous current revision.
  // ALL writes happen inside the dispatcher's runAsWorkflowEngine wrap (PIC-47
  // pattern) — including the Drawing.currentRevisionId write, which is a
  // workflow-driven write on a non-workflow-managed entity (Drawing is NOT in
  // WORKFLOW_DRIVEN_MODELS, so the structural guard does NOT cover it;
  // caller-compliance discipline applies and is asserted in tests).
  // Returned / rejected are silently ignored at convergence — same pattern as
  // tax_invoice / credit_note; workflow_instance.status tracks workflow-level
  // state, and the team responds by creating a new revision.
  'drawing_revision',
] as const;

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
// Purchase Order convergence
// ---------------------------------------------------------------------------
//
// When the workflow for a PO completes (approved / returned / rejected), we
// drive the PO's status to match. On approval, we also run budget absorption
// and fire the PO_COMMITTED posting event — the same side effects the manual
// transition path has.
//
// KNOWN LIMITATION: If budget absorption fails with a blocking reason (e.g.
// no budget line, no category mapping), the manual transition path reverts
// the status. In the convergence path, by the time we get here the workflow
// is already complete, so we leave the PO in 'approved' state and rely on
// the recorded absorption exception to surface the problem to an admin.
// A follow-up should pre-validate budget mapping before the final workflow
// step can complete, so the error never lands post-approval.

async function handlePoApproved(payload: WorkflowEventPayload): Promise<void> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: payload.recordId },
    include: { project: true },
  });
  if (!po) return;
  if (po.status === 'approved') return; // already converged (idempotent)

  const beforeStatus = po.status;

  // Update record status
  await prisma.purchaseOrder.update({
    where: { id: payload.recordId },
    data: { status: 'approved' as PurchaseOrderStatus },
  });

  // Audit with workflow provenance
  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'purchase_order.transition.workflow_approved',
    resourceType: 'purchase_order',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'approved',
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

  // Budget absorption — same as the manual transition path. An absorption
  // exception is recorded in the DB regardless of outcome; the block-and-
  // revert behavior of the manual path is intentionally NOT replicated here
  // (see file header comment above).
  const absorption = await absorbPoCommitment(po.projectId, po.id, payload.actorUserId);
  if (!absorption.absorbed) {
    console.warn(
      `[convergence] PO ${po.id}: budget absorption failed (${absorption.reasonCode}) — ${absorption.message}. Exception: ${absorption.exceptionId}. PO remains in 'approved' state; admin must resolve the absorption exception.`,
    );
  }

  // Posting event: PO_COMMITTED — parity with manual transition path.
  await postingService.post({
    eventType: 'PO_COMMITTED',
    sourceService: 'procurement',
    sourceRecordType: 'purchase_order',
    sourceRecordId: po.id,
    projectId: po.projectId,
    entityId: po.project.entityId,
    idempotencyKey: `po-committed-${po.id}`,
    payload: {
      purchaseOrderId: po.id,
      poNumber: po.poNumber,
      vendorId: po.vendorId,
      totalAmount: String(po.totalAmount),
      currency: po.currency,
      categoryId: po.categoryId,
      projectId: po.projectId,
      entityId: po.project.entityId,
    },
    actorUserId: payload.actorUserId,
  });

  console.log(
    `[convergence] PO ${payload.recordId}: ${beforeStatus} → approved (workflow ${payload.instanceId})`,
  );
}

async function handlePoReturned(payload: WorkflowEventPayload): Promise<void> {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: payload.recordId } });
  if (!po) return;
  if (po.status === 'returned') return; // idempotent

  const beforeStatus = po.status;

  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.purchaseOrder.update({
    where: { id: payload.recordId },
    data: { status: 'returned' as PurchaseOrderStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'purchase_order.transition.workflow_returned',
    resourceType: 'purchase_order',
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
    `[convergence] PO ${payload.recordId}: ${beforeStatus} → returned (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handlePoRejected(payload: WorkflowEventPayload): Promise<void> {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: payload.recordId } });
  if (!po) return;
  if (po.status === 'rejected') return; // idempotent

  const beforeStatus = po.status;

  await prisma.purchaseOrder.update({
    where: { id: payload.recordId },
    data: { status: 'rejected' as PurchaseOrderStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'purchase_order.transition.workflow_rejected',
    resourceType: 'purchase_order',
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
    `[convergence] PO ${payload.recordId}: ${beforeStatus} → rejected (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// Supplier Invoice convergence
// ---------------------------------------------------------------------------
//
// When the workflow for an SI completes (approved / returned / rejected), we
// drive the SI's status to match. On approval, we also run budget absorption
// (SI approved → actualAmount++) and fire the SUPPLIER_INVOICE_APPROVED posting
// event — the same side effects the manual transition path has.
//
// Option A semantics: workflow-returned SIs land in 'disputed' state (the
// same state operators use for manual dispute). One state, unified meaning
// — "this invoice has an issue that needs resolution".
//
// KNOWN LIMITATION: Same as PO — if budget absorption fails during workflow
// approval, the SI stays at 'approved' and the absorption exception is
// recorded for admin resolution. Follow-up: pre-validate budget mapping
// before the final workflow step can complete.

async function handleSupplierInvoiceApproved(payload: WorkflowEventPayload): Promise<void> {
  const si = await prisma.supplierInvoice.findUnique({
    where: { id: payload.recordId },
    include: { project: true },
  });
  if (!si) return;
  if (si.status === 'approved') return; // already converged (idempotent)

  const beforeStatus = si.status;

  // Update record status
  await prisma.supplierInvoice.update({
    where: { id: payload.recordId },
    data: { status: 'approved' as SupplierInvoiceStatus },
  });

  // Audit with workflow provenance
  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'supplier_invoice.transition.workflow_approved',
    resourceType: 'supplier_invoice',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'approved',
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

  // Budget absorption — SI approved → actualAmount++. Parity with manual path.
  const absorption = await absorbSupplierInvoiceActual(si.projectId, si.id, payload.actorUserId);
  if (!absorption.absorbed) {
    console.warn(
      `[convergence] SI ${si.id}: budget absorption failed (${absorption.reasonCode}) — ${absorption.message}. Exception: ${absorption.exceptionId}. SI remains in 'approved' state; admin must resolve the absorption exception.`,
    );
  }

  // Posting event: SUPPLIER_INVOICE_APPROVED — same idempotency key as manual
  // path, so duplicate events from both paths deduplicate at the posting service.
  await postingService.post({
    eventType: 'SUPPLIER_INVOICE_APPROVED',
    sourceService: 'procurement',
    sourceRecordType: 'supplier_invoice',
    sourceRecordId: si.id,
    projectId: si.projectId,
    entityId: si.project.entityId,
    idempotencyKey: `si-approved-${si.id}`,
    payload: {
      supplierInvoiceId: si.id,
      invoiceNumber: si.invoiceNumber,
      vendorId: si.vendorId,
      purchaseOrderId: si.purchaseOrderId,
      grossAmount: String(si.grossAmount),
      vatAmount: String(si.vatAmount),
      totalAmount: String(si.totalAmount),
      currency: si.currency,
      projectId: si.projectId,
      entityId: si.project.entityId,
    },
    actorUserId: payload.actorUserId,
  });

  console.log(
    `[convergence] SI ${payload.recordId}: ${beforeStatus} → approved (workflow ${payload.instanceId})`,
  );
}

async function handleSupplierInvoiceReturned(payload: WorkflowEventPayload): Promise<void> {
  const si = await prisma.supplierInvoice.findUnique({ where: { id: payload.recordId } });
  if (!si) return;
  if (si.status === 'disputed') return; // idempotent

  const beforeStatus = si.status;

  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.supplierInvoice.update({
    where: { id: payload.recordId },
    data: { status: 'disputed' as SupplierInvoiceStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'supplier_invoice.transition.workflow_returned',
    resourceType: 'supplier_invoice',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'disputed',
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
    `[convergence] SI ${payload.recordId}: ${beforeStatus} → disputed (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handleSupplierInvoiceRejected(payload: WorkflowEventPayload): Promise<void> {
  const si = await prisma.supplierInvoice.findUnique({ where: { id: payload.recordId } });
  if (!si) return;
  if (si.status === 'rejected') return; // idempotent

  const beforeStatus = si.status;

  await prisma.supplierInvoice.update({
    where: { id: payload.recordId },
    data: { status: 'rejected' as SupplierInvoiceStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'supplier_invoice.transition.workflow_rejected',
    resourceType: 'supplier_invoice',
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
    `[convergence] SI ${payload.recordId}: ${beforeStatus} → rejected (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// Expense convergence
// ---------------------------------------------------------------------------
//
// When the workflow for an Expense completes (approved / returned / rejected),
// we drive the Expense's status to match. On approval, we also run budget
// absorption (Expense approved → actualAmount++) and fire the EXPENSE_APPROVED
// posting event — the same side effects the manual transition path has.
//
// Uses a dedicated 'returned' state (introduced in this lane) rather than
// overloading an existing state — matches the PO pattern, differs from SI's
// 'disputed' reuse (SI's disputed had pre-existing operator semantics worth
// preserving; Expense has no such state).
//
// KNOWN LIMITATION: Same as PO/SI — if budget absorption fails during
// workflow approval, the expense stays at 'approved' and the absorption
// exception is recorded for admin resolution. Follow-up: pre-validate
// budget mapping before the final workflow step can complete.

async function handleExpenseApproved(payload: WorkflowEventPayload): Promise<void> {
  const expense = await prisma.expense.findUnique({
    where: { id: payload.recordId },
    include: { project: true },
  });
  if (!expense) return;
  if (expense.status === 'approved') return; // already converged (idempotent)

  const beforeStatus = expense.status;

  await prisma.expense.update({
    where: { id: payload.recordId },
    data: { status: 'approved' as ExpenseStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'expense.transition.workflow_approved',
    resourceType: 'expense',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'approved',
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

  const absorption = await absorbExpenseActual(expense.projectId, expense.id, payload.actorUserId);
  if (!absorption.absorbed) {
    console.warn(
      `[convergence] Expense ${expense.id}: budget absorption failed (${absorption.reasonCode}) — ${absorption.message}. Exception: ${absorption.exceptionId}. Expense remains in 'approved' state; admin must resolve the absorption exception.`,
    );
  }

  await postingService.post({
    eventType: 'EXPENSE_APPROVED',
    sourceService: 'procurement',
    sourceRecordType: 'expense',
    sourceRecordId: expense.id,
    projectId: expense.projectId,
    entityId: expense.project.entityId,
    idempotencyKey: `expense-approved-${expense.id}`,
    payload: {
      expenseId: expense.id,
      subtype: expense.subtype,
      amount: String(expense.amount),
      currency: expense.currency,
      categoryId: expense.categoryId,
      projectId: expense.projectId,
      entityId: expense.project.entityId,
    },
    actorUserId: payload.actorUserId,
  });

  console.log(
    `[convergence] Expense ${payload.recordId}: ${beforeStatus} → approved (workflow ${payload.instanceId})`,
  );
}

async function handleExpenseReturned(payload: WorkflowEventPayload): Promise<void> {
  const expense = await prisma.expense.findUnique({ where: { id: payload.recordId } });
  if (!expense) return;
  if (expense.status === 'returned') return;

  const beforeStatus = expense.status;

  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.expense.update({
    where: { id: payload.recordId },
    data: { status: 'returned' as ExpenseStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'expense.transition.workflow_returned',
    resourceType: 'expense',
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
    `[convergence] Expense ${payload.recordId}: ${beforeStatus} → returned (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handleExpenseRejected(payload: WorkflowEventPayload): Promise<void> {
  const expense = await prisma.expense.findUnique({ where: { id: payload.recordId } });
  if (!expense) return;
  if (expense.status === 'rejected') return;

  const beforeStatus = expense.status;

  await prisma.expense.update({
    where: { id: payload.recordId },
    data: { status: 'rejected' as ExpenseStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'expense.transition.workflow_rejected',
    resourceType: 'expense',
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
    `[convergence] Expense ${payload.recordId}: ${beforeStatus} → rejected (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// CostProposal convergence (PIC-35 Step 4)
//
// All workflow outcomes map cleanly to enum values:
//   approved  → 'approved_internal'
//   returned  → 'returned'
//   rejected  → 'rejected'
// ---------------------------------------------------------------------------

async function handleCostProposalApproved(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.costProposal.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'approved_internal') return; // idempotent

  const beforeStatus = record.status;
  await prisma.costProposal.update({
    where: { id: payload.recordId },
    data: { status: 'approved_internal' as CostProposalStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'cost_proposal.transition.workflow_approved',
    resourceType: 'cost_proposal',
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
    `[convergence] CostProposal ${payload.recordId}: ${beforeStatus} → approved_internal (workflow ${payload.instanceId})`,
  );
}

async function handleCostProposalReturned(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.costProposal.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'returned') return; // idempotent

  const beforeStatus = record.status;
  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.costProposal.update({
    where: { id: payload.recordId },
    data: { status: 'returned' as CostProposalStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'cost_proposal.transition.workflow_returned',
    resourceType: 'cost_proposal',
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
    `[convergence] CostProposal ${payload.recordId}: ${beforeStatus} → returned (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handleCostProposalRejected(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.costProposal.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'rejected') return; // idempotent

  const beforeStatus = record.status;
  await prisma.costProposal.update({
    where: { id: payload.recordId },
    data: { status: 'rejected' as CostProposalStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'cost_proposal.transition.workflow_rejected',
    resourceType: 'cost_proposal',
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
    `[convergence] CostProposal ${payload.recordId}: ${beforeStatus} → rejected (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// TaxInvoice convergence (PIC-35 Step 4)
//
// Divergence note: TaxInvoiceStatus enum has NO `rejected` value. Workflow
// rejection maps to `cancelled` (the closest negative-outcome terminal state).
// If a future schema migration adds `rejected` to the enum, switch the target
// here. The audit trail records the workflow-rejected event regardless, so
// the provenance is preserved.
// ---------------------------------------------------------------------------

async function handleTaxInvoiceApproved(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.taxInvoice.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'approved_internal') return; // idempotent

  const beforeStatus = record.status;
  await prisma.taxInvoice.update({
    where: { id: payload.recordId },
    data: { status: 'approved_internal' as TaxInvoiceStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'tax_invoice.transition.workflow_approved',
    resourceType: 'tax_invoice',
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
    `[convergence] TaxInvoice ${payload.recordId}: ${beforeStatus} → approved_internal (workflow ${payload.instanceId})`,
  );
}

async function handleTaxInvoiceReturned(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.taxInvoice.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'returned') return; // idempotent

  const beforeStatus = record.status;
  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.taxInvoice.update({
    where: { id: payload.recordId },
    data: { status: 'returned' as TaxInvoiceStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'tax_invoice.transition.workflow_returned',
    resourceType: 'tax_invoice',
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
    `[convergence] TaxInvoice ${payload.recordId}: ${beforeStatus} → returned (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handleTaxInvoiceRejected(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.taxInvoice.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'cancelled') return; // idempotent

  const beforeStatus = record.status;
  // TaxInvoiceStatus has no `rejected` — map to `cancelled` (closest negative outcome).
  await prisma.taxInvoice.update({
    where: { id: payload.recordId },
    data: { status: 'cancelled' as TaxInvoiceStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'tax_invoice.transition.workflow_rejected',
    resourceType: 'tax_invoice',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'cancelled',
      _convergence: {
        trigger: 'workflow.rejected',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        rejectedAtStep: payload.stepName ?? null,
        rejectedBy: payload.actorUserId,
        comment: payload.comment ?? null,
        statusMappingNote: 'TaxInvoiceStatus has no `rejected`; mapped to `cancelled`.',
      },
    },
    reason: `Workflow rejected at step "${payload.stepName}" → tax_invoice.status='cancelled' (instance: ${payload.instanceId}): ${payload.comment ?? 'no comment'}`,
  });

  console.log(
    `[convergence] TaxInvoice ${payload.recordId}: ${beforeStatus} → cancelled [workflow rejected; no 'rejected' in enum] (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// VendorContract convergence (PIC-35 Step 4)
// ---------------------------------------------------------------------------

async function handleVendorContractApproved(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.vendorContract.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'approved_internal') return;

  const beforeStatus = record.status;
  await prisma.vendorContract.update({
    where: { id: payload.recordId },
    data: { status: 'approved_internal' as VendorContractStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'vendor_contract.transition.workflow_approved',
    resourceType: 'vendor_contract',
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
    `[convergence] VendorContract ${payload.recordId}: ${beforeStatus} → approved_internal (workflow ${payload.instanceId})`,
  );
}

async function handleVendorContractReturned(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.vendorContract.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'returned') return;

  const beforeStatus = record.status;
  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.vendorContract.update({
    where: { id: payload.recordId },
    data: { status: 'returned' as VendorContractStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'vendor_contract.transition.workflow_returned',
    resourceType: 'vendor_contract',
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
    `[convergence] VendorContract ${payload.recordId}: ${beforeStatus} → returned (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handleVendorContractRejected(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.vendorContract.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'rejected') return;

  const beforeStatus = record.status;
  await prisma.vendorContract.update({
    where: { id: payload.recordId },
    data: { status: 'rejected' as VendorContractStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'vendor_contract.transition.workflow_rejected',
    resourceType: 'vendor_contract',
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
    `[convergence] VendorContract ${payload.recordId}: ${beforeStatus} → rejected (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// FrameworkAgreement convergence (PIC-35 Step 4)
// ---------------------------------------------------------------------------

async function handleFrameworkAgreementApproved(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.frameworkAgreement.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'approved_internal') return;

  const beforeStatus = record.status;
  await prisma.frameworkAgreement.update({
    where: { id: payload.recordId },
    data: { status: 'approved_internal' as FrameworkAgreementStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'framework_agreement.transition.workflow_approved',
    resourceType: 'framework_agreement',
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
    `[convergence] FrameworkAgreement ${payload.recordId}: ${beforeStatus} → approved_internal (workflow ${payload.instanceId})`,
  );
}

async function handleFrameworkAgreementReturned(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.frameworkAgreement.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'returned') return;

  const beforeStatus = record.status;
  const instance = await loadInstanceContext(payload.instanceId);
  const returnToStep = instance?.currentStepId
    ? instance.template.steps.find((s) => s.id === instance.currentStepId)
    : null;

  await prisma.frameworkAgreement.update({
    where: { id: payload.recordId },
    data: { status: 'returned' as FrameworkAgreementStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'framework_agreement.transition.workflow_returned',
    resourceType: 'framework_agreement',
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
    `[convergence] FrameworkAgreement ${payload.recordId}: ${beforeStatus} → returned (step "${payload.stepName}" → "${returnToStep?.name}")`,
  );
}

async function handleFrameworkAgreementRejected(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.frameworkAgreement.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'rejected') return;

  const beforeStatus = record.status;
  await prisma.frameworkAgreement.update({
    where: { id: payload.recordId },
    data: { status: 'rejected' as FrameworkAgreementStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'framework_agreement.transition.workflow_rejected',
    resourceType: 'framework_agreement',
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
    `[convergence] FrameworkAgreement ${payload.recordId}: ${beforeStatus} → rejected (step "${payload.stepName}")`,
  );
}

// ---------------------------------------------------------------------------
// CreditNote convergence (PIC-35 Step 4)
//
// Divergence note: CreditNoteStatus enum is a verification lifecycle
// (received → verified → applied → closed), not an approval lifecycle.
//   approved  → 'verified' (workflow verifies the credit note)
//   returned  → SKIPPED (no `returned` in enum; workflow_instance.status='returned'
//                still correctly tracks the workflow state — entity stays at
//                current status until the next workflow transition fires)
//   rejected  → 'cancelled' (closest negative-outcome state)
// If a future schema migration adds `returned` and `rejected`, add a handler
// for `returned` and switch the rejected target.
// ---------------------------------------------------------------------------

async function handleCreditNoteApproved(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.creditNote.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'verified') return;

  const beforeStatus = record.status;
  await prisma.creditNote.update({
    where: { id: payload.recordId },
    data: { status: 'verified' as CreditNoteStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'credit_note.transition.workflow_approved',
    resourceType: 'credit_note',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'verified',
      _convergence: {
        trigger: 'workflow.approved',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        finalStepApprovedBy: payload.actorUserId,
        comment: payload.comment ?? null,
        statusMappingNote: 'CreditNote uses verification lifecycle; approved → verified.',
      },
    },
    reason: `Workflow approval complete → credit_note.status='verified' (instance: ${payload.instanceId}, template: ${payload.templateCode})`,
  });

  console.log(
    `[convergence] CreditNote ${payload.recordId}: ${beforeStatus} → verified (workflow ${payload.instanceId})`,
  );
}

async function handleCreditNoteRejected(payload: WorkflowEventPayload): Promise<void> {
  const record = await prisma.creditNote.findUnique({ where: { id: payload.recordId } });
  if (!record) return;
  if (record.status === 'cancelled') return;

  const beforeStatus = record.status;
  // CreditNoteStatus has no `rejected` — map to `cancelled`.
  await prisma.creditNote.update({
    where: { id: payload.recordId },
    data: { status: 'cancelled' as CreditNoteStatus },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'credit_note.transition.workflow_rejected',
    resourceType: 'credit_note',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus },
    afterJson: {
      status: 'cancelled',
      _convergence: {
        trigger: 'workflow.rejected',
        workflowInstanceId: payload.instanceId,
        templateCode: payload.templateCode,
        rejectedAtStep: payload.stepName ?? null,
        rejectedBy: payload.actorUserId,
        comment: payload.comment ?? null,
        statusMappingNote: 'CreditNoteStatus has no `rejected`; mapped to `cancelled`.',
      },
    },
    reason: `Workflow rejected at step "${payload.stepName}" → credit_note.status='cancelled' (instance: ${payload.instanceId}): ${payload.comment ?? 'no comment'}`,
  });

  console.log(
    `[convergence] CreditNote ${payload.recordId}: ${beforeStatus} → cancelled [workflow rejected; no 'rejected' in enum] (step "${payload.stepName}")`,
  );
}

// Note: No handleCreditNoteReturned — CreditNoteStatus has no `returned`.
// Workflow.returned events for credit_note are silently ignored; the
// workflow_instance.status='returned' remains the source of truth for
// workflow-level state. See section comment above.

// ---------------------------------------------------------------------------
// DrawingRevision convergence (PIC-52)
// ---------------------------------------------------------------------------

async function handleDrawingRevisionApproved(payload: WorkflowEventPayload): Promise<void> {
  const rev = await prisma.drawingRevision.findUnique({
    where: { id: payload.recordId },
    include: { drawing: true },
  });
  if (!rev) return;
  if (rev.status === 'for_construction') return; // already converged (idempotent)

  const beforeStatus = rev.status;
  const drawing = rev.drawing;
  const previousCurrentRevisionId = drawing.currentRevisionId;

  // (1) Write this revision → for_construction. DrawingRevision is in
  //     WORKFLOW_DRIVEN_MODELS so this status write is gated by the
  //     no-direct-status-write extension; the surrounding runAsWorkflowEngine
  //     scope (from the dispatcher below) authorises it.
  const updated = await prisma.drawingRevision.update({
    where: { id: payload.recordId },
    data: { status: 'for_construction' },
  });

  // (2) Supersede the previous current revision (if any). Also a
  //     DrawingRevision status write — same engine-scoping discipline.
  if (previousCurrentRevisionId && previousCurrentRevisionId !== updated.id) {
    await prisma.drawingRevision.update({
      where: { id: previousCurrentRevisionId },
      data: { status: 'superseded' },
    });
  }

  // (3) Point the Drawing header at this revision. Drawing is NOT in
  //     WORKFLOW_DRIVEN_MODELS — the extension does NOT structurally
  //     guard this write. Caller-compliance discipline applies: the
  //     surrounding runAsWorkflowEngine scope still makes this a
  //     workflow-engine-authored write, just not a structurally-required
  //     one. Asserted by test (see tests/documents/drawings/).
  await prisma.drawing.update({
    where: { id: drawing.id },
    data: { currentRevisionId: updated.id },
  });

  await auditService.log({
    actorUserId: payload.actorUserId,
    actorSource: 'system',
    action: 'drawing_revision.transition.workflow_approved',
    resourceType: 'drawing_revision',
    resourceId: payload.recordId,
    projectId: payload.projectId,
    beforeJson: { status: beforeStatus, drawingCurrentRevisionId: previousCurrentRevisionId },
    afterJson: {
      status: 'for_construction',
      drawingCurrentRevisionId: updated.id,
      supersededPreviousRevisionId: previousCurrentRevisionId ?? null,
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
    `[convergence] DrawingRevision ${payload.recordId}: ${beforeStatus} → for_construction (workflow ${payload.instanceId}); Drawing ${drawing.id}.currentRevisionId updated${previousCurrentRevisionId ? `; previous revision ${previousCurrentRevisionId} → superseded` : ''}`,
  );
}

// ---------------------------------------------------------------------------
// Event dispatchers
// ---------------------------------------------------------------------------

async function onWorkflowApproved(payload: WorkflowEventPayload): Promise<void> {
  if (!isConvergenceWired(payload.recordType)) return;
  // PIC-35 Step 7: status writes inside convergence handlers are authorized
  // via runAsWorkflowEngine's AsyncLocalStorage scope. The Prisma extension
  // blocks direct entity.status writes outside this scope.
  await runAsWorkflowEngine(async () => {
    if (payload.recordType === 'ipa') return handleIpaApproved(payload);
    if (payload.recordType === 'ipc') return handleIpcApproved(payload);
    if (payload.recordType === 'rfq') return handleRfqApproved(payload);
    if (payload.recordType === 'variation') return handleVariationApproved(payload);
    if (payload.recordType === 'correspondence') return handleCorrespondenceApproved(payload);
    if (payload.recordType === 'purchase_order') return handlePoApproved(payload);
    if (payload.recordType === 'supplier_invoice') return handleSupplierInvoiceApproved(payload);
    if (payload.recordType === 'expense') return handleExpenseApproved(payload);
    if (payload.recordType === 'cost_proposal') return handleCostProposalApproved(payload);
    if (payload.recordType === 'tax_invoice') return handleTaxInvoiceApproved(payload);
    if (payload.recordType === 'vendor_contract') return handleVendorContractApproved(payload);
    if (payload.recordType === 'framework_agreement') return handleFrameworkAgreementApproved(payload);
    if (payload.recordType === 'credit_note') return handleCreditNoteApproved(payload);
    // PIC-52 — Drawing Register. Returned / rejected events for
    // drawing_revision are silently ignored at convergence (entity stays in
    // for_approval; workflow_instance.status carries the workflow-level
    // outcome; team responds by creating a new revision).
    if (payload.recordType === 'drawing_revision') return handleDrawingRevisionApproved(payload);
  });
}

async function onWorkflowReturned(payload: WorkflowEventPayload): Promise<void> {
  if (!isConvergenceWired(payload.recordType)) return;
  await runAsWorkflowEngine(async () => {
    if (payload.recordType === 'ipa') return handleIpaReturned(payload);
    if (payload.recordType === 'ipc') return handleIpcReturned(payload);
    if (payload.recordType === 'rfq') return handleRfqReturned(payload);
    if (payload.recordType === 'variation') return handleVariationReturned(payload);
    if (payload.recordType === 'correspondence') return handleCorrespondenceReturned(payload);
    if (payload.recordType === 'purchase_order') return handlePoReturned(payload);
    if (payload.recordType === 'supplier_invoice') return handleSupplierInvoiceReturned(payload);
    if (payload.recordType === 'expense') return handleExpenseReturned(payload);
    if (payload.recordType === 'cost_proposal') return handleCostProposalReturned(payload);
    if (payload.recordType === 'tax_invoice') return handleTaxInvoiceReturned(payload);
    if (payload.recordType === 'vendor_contract') return handleVendorContractReturned(payload);
    if (payload.recordType === 'framework_agreement') return handleFrameworkAgreementReturned(payload);
    // credit_note has no `returned` in its enum — workflow.returned events are
    // silently ignored at the convergence layer (workflow_instance.status='returned'
    // still tracks workflow-level state correctly).
  });
}

async function onWorkflowRejected(payload: WorkflowEventPayload): Promise<void> {
  if (!isConvergenceWired(payload.recordType)) return;
  await runAsWorkflowEngine(async () => {
    if (payload.recordType === 'ipa') return handleIpaRejected(payload);
    if (payload.recordType === 'ipc') return handleIpcRejected(payload);
    if (payload.recordType === 'rfq') return handleRfqRejected(payload);
    if (payload.recordType === 'variation') return handleVariationRejected(payload);
    if (payload.recordType === 'correspondence') return handleCorrespondenceRejected(payload);
    if (payload.recordType === 'purchase_order') return handlePoRejected(payload);
    if (payload.recordType === 'supplier_invoice') return handleSupplierInvoiceRejected(payload);
    if (payload.recordType === 'expense') return handleExpenseRejected(payload);
    if (payload.recordType === 'cost_proposal') return handleCostProposalRejected(payload);
    if (payload.recordType === 'tax_invoice') return handleTaxInvoiceRejected(payload);
    if (payload.recordType === 'vendor_contract') return handleVendorContractRejected(payload);
    if (payload.recordType === 'framework_agreement') return handleFrameworkAgreementRejected(payload);
    if (payload.recordType === 'credit_note') return handleCreditNoteRejected(payload);
  });
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
