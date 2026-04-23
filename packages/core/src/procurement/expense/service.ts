/**
 * Expense service — project-scoped CRUD with status transitions + posting.
 *
 * Module 3 Procurement Engine — Expense lifecycle.
 */
import { prisma } from '@fmksa/db';
import type { ExpenseStatus } from '@fmksa/db';
import { auditService } from '../../audit/service';
import { postingService } from '../../posting/service';
import { assertProjectScope } from '../../scope-binding';
import {
  EXPENSE_TRANSITIONS,
  EXPENSE_TERMINAL_STATUSES,
  EXPENSE_ACTION_TO_STATUS,
  EXPENSE_WORKFLOW_MANAGED_ACTIONS,
} from './transitions';
import { absorbExpenseActual } from '../../budget/absorption';
import {
  workflowInstanceService,
  TemplateNotActiveError,
  DuplicateInstanceError,
  resolveTemplate,
} from '../../workflow';

// ---------------------------------------------------------------------------
// Create (status: draft)
// ---------------------------------------------------------------------------

export async function createExpense(
  input: {
    projectId: string;
    subtype: string;
    title: string;
    description?: string | null | undefined;
    amount: number | string;
    currency: string;
    expenseDate: string;
    categoryId?: string | null | undefined;
    receiptReference?: string | null | undefined;
    purchaseOrderId?: string | null | undefined;
    ticketType?: string | null | undefined;
    travelerName?: string | null | undefined;
    origin?: string | null | undefined;
    destination?: string | null | undefined;
    travelDate?: string | null | undefined;
    returnDate?: string | null | undefined;
    guestName?: string | null | undefined;
    checkIn?: string | null | undefined;
    checkOut?: string | null | undefined;
    hotelName?: string | null | undefined;
    expenseCity?: string | null | undefined;
    nightlyRate?: number | string | null | undefined;
    nights?: number | null | undefined;
    vehicleType?: string | null | undefined;
    transportOrigin?: string | null | undefined;
    transportDestination?: string | null | undefined;
    distance?: number | string | null | undefined;
    rateType?: string | null | undefined;
    equipmentName?: string | null | undefined;
    equipmentType?: string | null | undefined;
    rentalPeriodFrom?: string | null | undefined;
    rentalPeriodTo?: string | null | undefined;
    dailyRate?: number | string | null | undefined;
    days?: number | null | undefined;
  },
  actorUserId: string,
) {
  const record = await prisma.expense.create({
    data: {
      projectId: input.projectId,
      subtype: input.subtype as any,
      title: input.title,
      description: input.description ?? null,
      amount: input.amount,
      currency: input.currency,
      expenseDate: new Date(input.expenseDate),
      categoryId: input.categoryId ?? null,
      receiptReference: input.receiptReference ?? null,
      purchaseOrderId: input.purchaseOrderId ?? null,
      status: 'draft',
      createdBy: actorUserId,
      // ticket-specific
      ticketType: input.ticketType as any ?? null,
      travelerName: input.travelerName ?? null,
      origin: input.origin ?? null,
      destination: input.destination ?? null,
      travelDate: input.travelDate ? new Date(input.travelDate) : null,
      returnDate: input.returnDate ? new Date(input.returnDate) : null,
      // accommodation-specific
      guestName: input.guestName ?? null,
      checkIn: input.checkIn ? new Date(input.checkIn) : null,
      checkOut: input.checkOut ? new Date(input.checkOut) : null,
      hotelName: input.hotelName ?? null,
      expenseCity: input.expenseCity ?? null,
      nightlyRate: input.nightlyRate ?? null,
      nights: input.nights ?? null,
      // transportation-specific
      vehicleType: input.vehicleType ?? null,
      transportOrigin: input.transportOrigin ?? null,
      transportDestination: input.transportDestination ?? null,
      distance: input.distance ?? null,
      rateType: input.rateType as any ?? null,
      // equipment-specific
      equipmentName: input.equipmentName ?? null,
      equipmentType: input.equipmentType ?? null,
      rentalPeriodFrom: input.rentalPeriodFrom ? new Date(input.rentalPeriodFrom) : null,
      rentalPeriodTo: input.rentalPeriodTo ? new Date(input.rentalPeriodTo) : null,
      dailyRate: input.dailyRate ?? null,
      days: input.days ?? null,
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'expense.create',
    resourceType: 'expense',
    resourceId: record.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: record as any,
  });

  return record;
}

// ---------------------------------------------------------------------------
// Get (with purchaseOrder + category relations)
// ---------------------------------------------------------------------------

export async function getExpense(id: string, projectId: string) {
  const record = await prisma.expense.findUniqueOrThrow({
    where: { id },
    include: { purchaseOrder: true, category: true },
  });
  assertProjectScope(record, projectId, 'Expense', id);
  return record;
}

// ---------------------------------------------------------------------------
// List (ordered by createdAt desc)
// ---------------------------------------------------------------------------

export async function listExpenses(projectId: string) {
  return prisma.expense.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { purchaseOrder: true, category: true },
  });
}

// ---------------------------------------------------------------------------
// Transition (with EXPENSE_APPROVED posting event)
// ---------------------------------------------------------------------------

export async function transitionExpense(
  params: { projectId: string; id: string; action: string; comment?: string | undefined },
  actorUserId: string,
) {
  const { projectId, id, action, comment } = params;

  const newStatus = EXPENSE_ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(`Unknown expense action: '${action}'`);
  }

  const existing = await prisma.expense.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });
  assertProjectScope(existing, projectId, 'Expense', id);

  // Terminal status check
  if (EXPENSE_TERMINAL_STATUSES.includes(existing.status)) {
    throw new Error(`Cannot transition expense from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = EXPENSE_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid expense transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // Workflow guard: block manual approval-phase actions when a workflow is
  // active. These actions are driven by the workflow step service, not direct
  // transitions. Legacy manual approval is still allowed when no workflow
  // instance exists (projects without an Expense workflow template configured).
  if (EXPENSE_WORKFLOW_MANAGED_ACTIONS.includes(action)) {
    const activeWorkflow = await prisma.workflowInstance.findFirst({
      where: {
        recordType: 'expense',
        recordId: id,
        status: { in: ['in_progress', 'returned'] },
      },
    });
    if (activeWorkflow) {
      throw new Error(
        `Cannot manually '${action}' this expense — the approval phase is managed by workflow instance ${activeWorkflow.id}. Use the workflow approval actions instead.`,
      );
    }
  }

  const updated = await prisma.expense.update({
    where: { id },
    data: { status: newStatus as ExpenseStatus },
    include: { project: true },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `expense.transition.${action}`,
    resourceType: 'expense',
    resourceId: id,
    projectId: existing.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
    reason: comment ?? null,
  });

  // ---------------------------------------------------------------------------
  // Auto-start workflow on submit (parity with PO / IPA pattern)
  // ---------------------------------------------------------------------------
  // If no active template exists for 'expense', this is graceful — the
  // transition still succeeds. Workflows are optional infrastructure;
  // projects without a template fall back to manual approval.
  if (newStatus === 'submitted') {
    try {
      const resolution = await resolveTemplate('expense', existing.projectId);
      if (resolution) {
        await workflowInstanceService.startInstance({
          templateCode: resolution.code,
          recordType: 'expense',
          recordId: id,
          projectId: existing.projectId,
          startedBy: actorUserId,
          resolutionSource: resolution.source,
        });
      } else {
        console.warn(
          `[expense-workflow] No workflow template configured for expense in project ${existing.projectId}`,
        );
      }
    } catch (err) {
      if (err instanceof TemplateNotActiveError || err instanceof DuplicateInstanceError) {
        console.warn(
          `[expense-workflow] Skipped workflow start for expense ${id}: ${(err as Error).message}`,
        );
      } else {
        throw err;
      }
    }
  }

  // Budget absorption: Expense approved → actualAmount++
  if (newStatus === 'approved') {
    const result = await absorbExpenseActual(existing.projectId, existing.id, actorUserId);
    if (!result.absorbed) {
      console.warn(`[Expense ${id}] Budget absorption failed: ${result.reasonCode} — ${result.message}`);
    }
  }

  // Fire EXPENSE_APPROVED posting event when transitioning to approved
  if (newStatus === 'approved') {
    await postingService.post({
      eventType: 'EXPENSE_APPROVED',
      sourceService: 'procurement',
      sourceRecordType: 'expense',
      sourceRecordId: updated.id,
      projectId: updated.projectId,
      entityId: updated.project.entityId,
      idempotencyKey: `expense-approved-${updated.id}`,
      payload: {
        expenseId: updated.id,
        subtype: updated.subtype,
        amount: String(updated.amount),
        currency: updated.currency,
        categoryId: updated.categoryId,
        projectId: updated.projectId,
        entityId: updated.project.entityId,
      },
      actorUserId,
    });
  }

  return updated;
}
