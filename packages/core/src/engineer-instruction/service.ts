import { prisma, Prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { recordAbsorptionException } from '../budget/absorption';
import {
  EI_TRANSITIONS,
  EI_TERMINAL_STATUSES,
  EI_ACTION_TO_STATUS,
} from './transitions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateEiInput {
  projectId: string;
  title: string;
  description?: string | undefined;
  estimatedValue: number;
  currency: string;
  reserveRate?: number | undefined;
  notes?: string | undefined;
}

export interface TransitionEiInput {
  id: string;
  projectId: string;
  action: string;
  variationId?: string | undefined;
  comment?: string | undefined;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createEi(input: CreateEiInput, actorUserId: string) {
  const rate = input.reserveRate ?? 0.5;
  const reserveAmount = input.estimatedValue * rate;

  const ei = await prisma.engineerInstruction.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      description: input.description ?? null,
      estimatedValue: input.estimatedValue,
      currency: input.currency,
      reserveRate: rate,
      reserveAmount,
      notes: input.notes ?? null,
      status: 'received',
      createdBy: actorUserId,
    },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'engineer_instruction.create',
    resourceType: 'engineer_instruction',
    resourceId: ei.id,
    projectId: input.projectId,
    beforeJson: null,
    afterJson: ei as any,
  });

  return ei;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getEi(id: string) {
  return prisma.engineerInstruction.findUniqueOrThrow({
    where: { id },
    include: { project: true, variation: true },
  });
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listEis(projectId: string) {
  return prisma.engineerInstruction.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { variation: true },
  });
}

// ---------------------------------------------------------------------------
// Transition
// ---------------------------------------------------------------------------

export async function transitionEi(input: TransitionEiInput, actorUserId: string) {
  const newStatus = EI_ACTION_TO_STATUS[input.action];
  if (!newStatus) {
    throw new Error(`Unknown EI action: '${input.action}'`);
  }

  const existing = await prisma.engineerInstruction.findUniqueOrThrow({
    where: { id: input.id },
  });
  if (existing.projectId !== input.projectId) {
    throw new Error(`EngineerInstruction ${input.id} does not belong to project ${input.projectId}.`);
  }

  // Terminal status check
  if (EI_TERMINAL_STATUSES.has(existing.status)) {
    throw new Error(`Cannot transition EI from terminal status '${existing.status}'.`);
  }

  // Transition validity check
  const allowed = EI_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid EI transition: '${existing.status}' -> '${newStatus}'. Allowed: [${(allowed ?? []).join(', ')}]`,
    );
  }

  // Conversion requires a variationId
  if (newStatus === 'converted' && !input.variationId) {
    throw new Error('variationId is required when converting an EI to a variation.');
  }

  // ---------------------------------------------------------------------------
  // Transitions that touch the budget require a transaction
  // ---------------------------------------------------------------------------

  const touchesBudget =
    newStatus === 'approved_reserve' ||
    newStatus === 'converted' ||
    ((newStatus === 'rejected' || newStatus === 'expired') &&
      existing.status === 'approved_reserve');

  if (touchesBudget) {
    return prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { status: newStatus };

      if (newStatus === 'converted') {
        updateData.variationId = input.variationId!;
      }

      const updated = await (tx as any).engineerInstruction.update({
        where: { id: input.id },
        data: updateData,
      });

      // Budget adjustments
      const budget = await (tx as any).projectBudget.findUnique({
        where: { projectId: input.projectId },
      });

      if (budget) {
        if (newStatus === 'approved_reserve') {
          // Add reserve to budget
          await (tx as any).projectBudget.update({
            where: { id: budget.id },
            data: {
              eiReserveTotal: new Prisma.Decimal(budget.eiReserveTotal.toString())
                .plus(existing.reserveAmount.toString()),
            },
          });

          await (tx as any).budgetAdjustment.create({
            data: {
              budgetId: budget.id,
              adjustmentType: 'ei_reserve_change',
              amount: existing.reserveAmount,
              reason: `EI reserve added: ${existing.title} (${input.id})`,
              createdBy: actorUserId,
            },
          });
        }

        if (
          newStatus === 'converted' ||
          ((newStatus === 'rejected' || newStatus === 'expired') &&
            existing.status === 'approved_reserve')
        ) {
          // Reverse the reserve from budget
          await (tx as any).projectBudget.update({
            where: { id: budget.id },
            data: {
              eiReserveTotal: new Prisma.Decimal(budget.eiReserveTotal.toString())
                .minus(existing.reserveAmount.toString()),
            },
          });

          const reason =
            newStatus === 'converted'
              ? `EI reserve reversed (converted to variation): ${existing.title} (${input.id})`
              : `EI reserve reversed (${newStatus}): ${existing.title} (${input.id})`;

          await (tx as any).budgetAdjustment.create({
            data: {
              budgetId: budget.id,
              adjustmentType: 'ei_reserve_change',
              amount: new Prisma.Decimal(existing.reserveAmount.toString()).negated(),
              reason,
              createdBy: actorUserId,
            },
          });
        }
      } else {
        // No budget — record exception instead of silently skipping
        const absorptionType = newStatus === 'approved_reserve'
          ? 'ei_reserve_increase'
          : 'ei_reserve_release';
        await recordAbsorptionException({
          projectId: input.projectId,
          sourceModule: 'engineer_instruction',
          sourceRecordType: 'engineer_instruction',
          sourceRecordId: input.id,
          absorptionType,
          reasonCode: 'no_budget',
          message: `Project has no ProjectBudget — EI reserve ${newStatus === 'approved_reserve' ? 'increase' : 'release'} cannot be tracked.`,
        });
      }

      await auditService.log(
        {
          actorUserId,
          actorSource: 'user',
          action: `engineer_instruction.transition.${input.action}`,
          resourceType: 'engineer_instruction',
          resourceId: input.id,
          projectId: input.projectId,
          beforeJson: existing as any,
          afterJson: updated as any,
          reason: input.comment ?? null,
        },
        tx,
      );

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Simple status update (no budget impact)
  // ---------------------------------------------------------------------------

  const updated = await prisma.engineerInstruction.update({
    where: { id: input.id },
    data: { status: newStatus as any },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `engineer_instruction.transition.${input.action}`,
    resourceType: 'engineer_instruction',
    resourceId: input.id,
    projectId: input.projectId,
    beforeJson: existing as any,
    afterJson: updated as any,
    reason: input.comment ?? null,
  });

  return updated;
}
