/**
 * PrimeContract service — client-side prime contract, 1:1 with Project.
 *
 * Layer 1 — PR-A1 (PIC-8). The PrimeContract is the revenue source-of-truth;
 * Project.contractValue is a denormalized cache kept in sync within the same
 * transaction.
 *
 * State machine:
 *   draft → signed | cancelled
 *   signed → active | cancelled
 *   active → completed | terminated | cancelled
 *   completed / terminated / cancelled → terminal
 *
 * Delete only allowed in draft or cancelled status.
 */
import { prisma, Prisma } from '@fmksa/db';
import type { PrimeContractStatus } from '@fmksa/db';
import type {
  CreatePrimeContractInput,
  UpdatePrimeContractInput,
} from '@fmksa/contracts';
import { auditService } from '../../audit/service';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<PrimeContractStatus, PrimeContractStatus[]> = {
  draft: ['signed', 'cancelled'],
  signed: ['active', 'cancelled'],
  active: ['completed', 'terminated', 'cancelled'],
  completed: [],
  terminated: [],
  cancelled: [],
};

const ACTION_TO_STATUS: Record<string, PrimeContractStatus> = {
  sign: 'signed',
  activate: 'active',
  complete: 'completed',
  terminate: 'terminated',
  cancel: 'cancelled',
};

const DELETABLE_STATUSES: PrimeContractStatus[] = ['draft', 'cancelled'];

// ---------------------------------------------------------------------------
// Create — atomic transaction
// ---------------------------------------------------------------------------
//
// 1. Validate contractingEntity is active
// 2. Ensure contractingEntity is a project participant (create if missing,
//    promote isPrime=true if existing)
// 3. Create PrimeContract
// 4. Sync Project.primeContractId + Project.contractValue
// 5. Audit log (inside transaction via tx)

export async function createPrimeContract(input: CreatePrimeContractInput) {
  return prisma.$transaction(async (tx) => {
    // (1) Entity active check
    const entity = await tx.entity.findUniqueOrThrow({
      where: { id: input.contractingEntityId },
    });
    if (entity.status !== 'active') {
      throw new Error(
        `Cannot create prime contract: contracting entity '${input.contractingEntityId}' is in status '${entity.status}'. Only active entities can hold prime contracts.`,
      );
    }

    // (2) Participant ensure (create or promote isPrime)
    const existingParticipant = await tx.projectParticipant.findFirst({
      where: {
        projectId: input.projectId,
        entityId: input.contractingEntityId,
      },
    });
    if (!existingParticipant) {
      await tx.projectParticipant.create({
        data: {
          projectId: input.projectId,
          entityId: input.contractingEntityId,
          role: 'prime_contractor',
          isPrime: true,
          createdBy: input.createdBy,
        },
      });
    } else if (!existingParticipant.isPrime) {
      await tx.projectParticipant.update({
        where: { id: existingParticipant.id },
        data: { isPrime: true },
      });
    }

    // (3) Create PrimeContract
    const primeContract = await tx.primeContract.create({
      data: {
        projectId: input.projectId,
        contractingEntityId: input.contractingEntityId,
        clientName: input.clientName,
        clientReference: input.clientReference ?? null,
        contractValue: input.contractValue,
        contractCurrency: input.contractCurrency ?? 'SAR',
        signedDate: input.signedDate ? new Date(input.signedDate) : null,
        effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
        expectedCompletionDate: input.expectedCompletionDate
          ? new Date(input.expectedCompletionDate)
          : null,
        status: input.status ?? 'draft',
        notes: input.notes ?? null,
        createdBy: input.createdBy,
      },
    });

    // (4) Sync Project (denormalized cache pointer + contractValue)
    await tx.project.update({
      where: { id: input.projectId },
      data: {
        primeContractId: primeContract.id,
        contractValue: input.contractValue,
      },
    });

    // (5) Audit log inside transaction
    await auditService.log(
      {
        actorUserId: input.createdBy,
        actorSource: 'user',
        action: 'prime_contract.create',
        resourceType: 'prime_contract',
        resourceId: primeContract.id,
        projectId: input.projectId,
        beforeJson: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        afterJson: primeContract as any,
      },
      tx as unknown as Record<string, unknown>,
    );

    return primeContract;
  });
}

// ---------------------------------------------------------------------------
// Get — by projectId (1:1)
// ---------------------------------------------------------------------------

export async function getPrimeContract(projectId: string) {
  return prisma.primeContract.findUnique({
    where: { projectId },
    include: { contractingEntity: true, currency: true },
  });
}

// ---------------------------------------------------------------------------
// Update — sync Project.contractValue on contractValue change
// ---------------------------------------------------------------------------

export async function updatePrimeContract(
  input: UpdatePrimeContractInput,
  actorUserId: string,
) {
  const existing = await prisma.primeContract.findUniqueOrThrow({
    where: { projectId: input.projectId },
  });

  return prisma.$transaction(async (tx) => {
    const data: Prisma.PrimeContractUpdateInput = {};
    if (input.contractingEntityId !== undefined)
      data.contractingEntity = { connect: { id: input.contractingEntityId } };
    if (input.clientName !== undefined) data.clientName = input.clientName;
    if (input.clientReference !== undefined)
      data.clientReference = input.clientReference ?? null;
    if (input.contractValue !== undefined) data.contractValue = input.contractValue;
    if (input.contractCurrency !== undefined)
      data.currency = { connect: { code: input.contractCurrency } };
    if (input.signedDate !== undefined)
      data.signedDate = input.signedDate ? new Date(input.signedDate) : null;
    if (input.effectiveDate !== undefined)
      data.effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : null;
    if (input.expectedCompletionDate !== undefined)
      data.expectedCompletionDate = input.expectedCompletionDate
        ? new Date(input.expectedCompletionDate)
        : null;
    if (input.status !== undefined) data.status = input.status;
    if (input.notes !== undefined) data.notes = input.notes ?? null;

    const updated = await tx.primeContract.update({
      where: { id: existing.id },
      data,
    });

    // Sync Project.contractValue if contractValue changed
    if (
      input.contractValue !== undefined &&
      !existing.contractValue.equals(input.contractValue)
    ) {
      await tx.project.update({
        where: { id: existing.projectId },
        data: { contractValue: input.contractValue },
      });
    }

    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'prime_contract.update',
        resourceType: 'prime_contract',
        resourceId: existing.id,
        projectId: existing.projectId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        beforeJson: existing as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        afterJson: updated as any,
      },
      tx as unknown as Record<string, unknown>,
    );

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Transition — state machine
// ---------------------------------------------------------------------------

export async function transitionPrimeContractStatus(
  projectId: string,
  action: string,
  actorUserId: string,
  comment?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(
      `Unknown prime contract action: '${action}'. Allowed: [${Object.keys(ACTION_TO_STATUS).join(', ')}].`,
    );
  }

  const existing = await prisma.primeContract.findUniqueOrThrow({
    where: { projectId },
  });

  const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid prime contract transition: '${existing.status}' → '${newStatus}'. Allowed from '${existing.status}': [${allowed.join(', ')}].`,
    );
  }

  const updated = await prisma.primeContract.update({
    where: { id: existing.id },
    data: { status: newStatus },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `prime_contract.transition.${action}`,
    resourceType: 'prime_contract',
    resourceId: existing.id,
    projectId: existing.projectId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeJson: existing as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterJson: updated as any,
    reason: comment ?? null,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Delete — only when draft or cancelled; clears Project cache fields
// ---------------------------------------------------------------------------

export async function deletePrimeContract(projectId: string, actorUserId: string) {
  const existing = await prisma.primeContract.findUniqueOrThrow({
    where: { projectId },
  });

  if (!DELETABLE_STATUSES.includes(existing.status)) {
    throw new Error(
      `Cannot delete prime contract in status '${existing.status}'. Only draft or cancelled prime contracts can be deleted.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: existing.projectId },
      data: {
        primeContractId: null,
        contractValue: null,
      },
    });

    await tx.primeContract.delete({ where: { id: existing.id } });

    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'prime_contract.delete',
        resourceType: 'prime_contract',
        resourceId: existing.id,
        projectId: existing.projectId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        beforeJson: existing as any,
        afterJson: null,
      },
      tx as unknown as Record<string, unknown>,
    );
  });
}
