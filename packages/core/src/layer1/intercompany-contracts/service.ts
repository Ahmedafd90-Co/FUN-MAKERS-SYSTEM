/**
 * IntercompanyContract service — directional Entity → Entity, scoped to Project.
 *
 * Layer 1 — PR-A1 (PIC-8). Service-layer enforcement of:
 *   - fromEntityId !== toEntityId (also enforced in contract schema .refine)
 *   - Both entities must be project participants
 *   - Both entities must be in active status
 *   - Entities are immutable on update
 *
 * State machine:
 *   draft → signed | cancelled
 *   signed → active | cancelled
 *   active → closed | cancelled
 *   closed / cancelled → terminal
 *
 * Delete only allowed in draft or cancelled status.
 */
import { prisma, Prisma } from '@fmksa/db';
import type { IntercompanyContractStatus } from '@fmksa/db';
import type {
  CreateIntercompanyContractInput,
  UpdateIntercompanyContractInput,
  ListIntercompanyContractsFilter,
} from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { assertProjectScope } from '../../scope-binding';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<IntercompanyContractStatus, IntercompanyContractStatus[]> = {
  draft: ['signed', 'cancelled'],
  signed: ['active', 'cancelled'],
  active: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

const ACTION_TO_STATUS: Record<string, IntercompanyContractStatus> = {
  sign: 'signed',
  activate: 'active',
  close: 'closed',
  cancel: 'cancelled',
};

const DELETABLE_STATUSES: IntercompanyContractStatus[] = ['draft', 'cancelled'];

// ---------------------------------------------------------------------------
// Create — validates participation + active status; rejects self-contracts
// ---------------------------------------------------------------------------

export async function createIntercompanyContract(input: CreateIntercompanyContractInput) {
  if (input.fromEntityId === input.toEntityId) {
    throw new Error(
      `Cannot create intercompany contract: fromEntityId and toEntityId must be different (got '${input.fromEntityId}').`,
    );
  }

  // Both entities must exist and be active
  const [fromEntity, toEntity] = await Promise.all([
    prisma.entity.findUniqueOrThrow({ where: { id: input.fromEntityId } }),
    prisma.entity.findUniqueOrThrow({ where: { id: input.toEntityId } }),
  ]);
  if (fromEntity.status !== 'active') {
    throw new Error(
      `Cannot create intercompany contract: fromEntity '${input.fromEntityId}' is in status '${fromEntity.status}'. Only active entities can be parties.`,
    );
  }
  if (toEntity.status !== 'active') {
    throw new Error(
      `Cannot create intercompany contract: toEntity '${input.toEntityId}' is in status '${toEntity.status}'. Only active entities can be parties.`,
    );
  }

  // Both entities must be project participants
  const participants = await prisma.projectParticipant.findMany({
    where: {
      projectId: input.projectId,
      entityId: { in: [input.fromEntityId, input.toEntityId] },
    },
    select: { entityId: true },
  });
  const participantIds = new Set(participants.map((p) => p.entityId));
  if (!participantIds.has(input.fromEntityId)) {
    throw new Error(
      `Cannot create intercompany contract: fromEntity '${input.fromEntityId}' is not a participant of project '${input.projectId}'. Add it as a participant first.`,
    );
  }
  if (!participantIds.has(input.toEntityId)) {
    throw new Error(
      `Cannot create intercompany contract: toEntity '${input.toEntityId}' is not a participant of project '${input.projectId}'. Add it as a participant first.`,
    );
  }

  const record = await prisma.intercompanyContract.create({
    data: {
      projectId: input.projectId,
      fromEntityId: input.fromEntityId,
      toEntityId: input.toEntityId,
      scope: input.scope,
      pricingType: input.pricingType,
      markupPercent: input.markupPercent,
      contractValue: input.contractValue ?? null,
      contractCurrency: input.contractCurrency ?? 'SAR',
      managingDepartment: input.managingDepartment,
      signedDate: input.signedDate ? new Date(input.signedDate) : null,
      status: input.status ?? 'draft',
      notes: input.notes ?? null,
      createdBy: input.createdBy,
    },
  });

  await auditService.log({
    actorUserId: input.createdBy,
    actorSource: 'user',
    action: 'intercompany_contract.create',
    resourceType: 'intercompany_contract',
    resourceId: record.id,
    projectId: input.projectId,
    beforeJson: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterJson: record as any,
  });

  return record;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getIntercompanyContract(id: string, projectId: string) {
  const record = await prisma.intercompanyContract.findUniqueOrThrow({
    where: { id },
    include: { fromEntity: true, toEntity: true, currency: true },
  });
  assertProjectScope(record, projectId, 'IntercompanyContract', id);
  return record;
}

// ---------------------------------------------------------------------------
// List — filterable
// ---------------------------------------------------------------------------

export async function listIntercompanyContracts(input: ListIntercompanyContractsFilter) {
  const where: Prisma.IntercompanyContractWhereInput = {
    projectId: input.projectId,
  };
  if (input.managingDepartment) where.managingDepartment = input.managingDepartment;
  if (input.status) where.status = input.status;
  if (input.fromEntityId) where.fromEntityId = input.fromEntityId;
  if (input.toEntityId) where.toEntityId = input.toEntityId;

  return prisma.intercompanyContract.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { fromEntity: true, toEntity: true },
  });
}

// ---------------------------------------------------------------------------
// Update — entities immutable; audit log
// ---------------------------------------------------------------------------

export async function updateIntercompanyContract(
  input: UpdateIntercompanyContractInput,
  actorUserId: string,
) {
  const existing = await prisma.intercompanyContract.findUniqueOrThrow({
    where: { id: input.id },
  });
  assertProjectScope(existing, input.projectId, 'IntercompanyContract', input.id);

  const data: Prisma.IntercompanyContractUpdateInput = {};
  if (input.scope !== undefined) data.scope = input.scope;
  if (input.pricingType !== undefined) data.pricingType = input.pricingType;
  if (input.markupPercent !== undefined) data.markupPercent = input.markupPercent;
  if (input.contractValue !== undefined) data.contractValue = input.contractValue ?? null;
  if (input.contractCurrency !== undefined)
    data.currency = { connect: { code: input.contractCurrency } };
  if (input.managingDepartment !== undefined) data.managingDepartment = input.managingDepartment;
  if (input.signedDate !== undefined)
    data.signedDate = input.signedDate ? new Date(input.signedDate) : null;
  if (input.status !== undefined) data.status = input.status;
  if (input.notes !== undefined) data.notes = input.notes ?? null;

  const updated = await prisma.intercompanyContract.update({
    where: { id: input.id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'intercompany_contract.update',
    resourceType: 'intercompany_contract',
    resourceId: input.id,
    projectId: existing.projectId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeJson: existing as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterJson: updated as any,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Transition — state machine
// ---------------------------------------------------------------------------

export async function transitionIntercompanyContractStatus(
  id: string,
  projectId: string,
  action: string,
  actorUserId: string,
  comment?: string,
) {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) {
    throw new Error(
      `Unknown intercompany contract action: '${action}'. Allowed: [${Object.keys(ACTION_TO_STATUS).join(', ')}].`,
    );
  }

  const existing = await prisma.intercompanyContract.findUniqueOrThrow({
    where: { id },
  });
  assertProjectScope(existing, projectId, 'IntercompanyContract', id);

  const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid intercompany contract transition: '${existing.status}' → '${newStatus}'. Allowed from '${existing.status}': [${allowed.join(', ')}].`,
    );
  }

  const updated = await prisma.intercompanyContract.update({
    where: { id },
    data: { status: newStatus },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: `intercompany_contract.transition.${action}`,
    resourceType: 'intercompany_contract',
    resourceId: id,
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
// Delete — only when draft or cancelled
// ---------------------------------------------------------------------------

export async function deleteIntercompanyContract(
  id: string,
  projectId: string,
  actorUserId: string,
) {
  const existing = await prisma.intercompanyContract.findUniqueOrThrow({
    where: { id },
  });
  assertProjectScope(existing, projectId, 'IntercompanyContract', id);

  if (!DELETABLE_STATUSES.includes(existing.status)) {
    throw new Error(
      `Cannot delete intercompany contract in status '${existing.status}'. Only draft or cancelled contracts can be deleted.`,
    );
  }

  await prisma.intercompanyContract.delete({ where: { id } });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'intercompany_contract.delete',
    resourceType: 'intercompany_contract',
    resourceId: id,
    projectId: existing.projectId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeJson: existing as any,
    afterJson: null,
  });
}
