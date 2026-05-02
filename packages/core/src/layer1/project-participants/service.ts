/**
 * ProjectParticipant service — bridge between Project and Entity declaring
 * participation roles.
 *
 * Layer 1 — PR-A1 (PIC-8). Project-scoped. Unique on (projectId, entityId);
 * single role per participation in Phase 1.
 */
import { prisma, Prisma } from '@fmksa/db';
import type {
  CreateProjectParticipantInput,
  UpdateProjectParticipantInput,
  ListProjectParticipantsFilter,
} from '@fmksa/contracts';
import { auditService } from '../../audit/service';
import { assertProjectScope } from '../../scope-binding';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createProjectParticipant(input: CreateProjectParticipantInput) {
  const entity = await prisma.entity.findUniqueOrThrow({
    where: { id: input.entityId },
  });
  if (entity.status !== 'active') {
    throw new Error(
      `Cannot create project participant: Entity '${input.entityId}' is in status '${entity.status}'. Only active entities can participate.`,
    );
  }

  let record;
  try {
    record = await prisma.projectParticipant.create({
      data: {
        projectId: input.projectId,
        entityId: input.entityId,
        role: input.role,
        isPrime: input.isPrime ?? false,
        notes: input.notes ?? null,
        createdBy: input.createdBy,
      },
    });
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new Error(
        `Entity '${input.entityId}' is already a participant of project '${input.projectId}'.`,
      );
    }
    throw err;
  }

  await auditService.log({
    actorUserId: input.createdBy,
    actorSource: 'user',
    action: 'project_participant.create',
    resourceType: 'project_participant',
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

export async function getProjectParticipant(id: string, projectId: string) {
  const record = await prisma.projectParticipant.findUniqueOrThrow({
    where: { id },
    include: { entity: true },
  });
  assertProjectScope(record, projectId, 'ProjectParticipant', id);
  return record;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listProjectParticipants(input: ListProjectParticipantsFilter) {
  const where: Prisma.ProjectParticipantWhereInput = {
    projectId: input.projectId,
  };
  if (input.role) {
    where.role = input.role;
  }

  return prisma.projectParticipant.findMany({
    where,
    orderBy: [{ isPrime: 'desc' }, { createdAt: 'asc' }],
    include: { entity: true },
  });
}

// ---------------------------------------------------------------------------
// Update — only role + notes mutable; entityId immutable
// ---------------------------------------------------------------------------

export async function updateProjectParticipant(
  input: UpdateProjectParticipantInput,
  actorUserId: string,
) {
  const existing = await prisma.projectParticipant.findUniqueOrThrow({
    where: { id: input.id },
  });
  assertProjectScope(existing, input.projectId, 'ProjectParticipant', input.id);

  const data: Prisma.ProjectParticipantUpdateInput = {};
  if (input.role !== undefined) data.role = input.role;
  if (input.notes !== undefined) data.notes = input.notes ?? null;

  const updated = await prisma.projectParticipant.update({
    where: { id: input.id },
    data,
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'project_participant.update',
    resourceType: 'project_participant',
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
// Delete — guarded by prime-contract-holder + active-intercompany checks
// ---------------------------------------------------------------------------

export async function deleteProjectParticipant(
  id: string,
  projectId: string,
  actorUserId: string,
) {
  const existing = await prisma.projectParticipant.findUniqueOrThrow({
    where: { id },
  });
  assertProjectScope(existing, projectId, 'ProjectParticipant', id);

  // Prime-contract-holder check: is this entity the contracting entity on the
  // project's prime contract (in any non-cancelled status)?
  const primeContractHeld = await prisma.primeContract.findFirst({
    where: {
      projectId: existing.projectId,
      contractingEntityId: existing.entityId,
      status: { notIn: ['cancelled'] },
    },
    select: { id: true, status: true },
  });
  if (primeContractHeld) {
    throw new Error(
      `Cannot delete participant '${id}': entity is the holder of prime contract '${primeContractHeld.id}' (status: '${primeContractHeld.status}'). Cancel or transfer the prime contract first.`,
    );
  }

  // Active-intercompany-contracts check: is this entity a from/to party on any
  // intercompany contract on this project that is still active (not cancelled
  // and not closed)?
  const activeIntercompany = await prisma.intercompanyContract.findFirst({
    where: {
      projectId: existing.projectId,
      OR: [
        { fromEntityId: existing.entityId },
        { toEntityId: existing.entityId },
      ],
      status: { notIn: ['cancelled', 'closed'] },
    },
    select: { id: true, status: true },
  });
  if (activeIntercompany) {
    throw new Error(
      `Cannot delete participant '${id}': entity is a party on active intercompany contract '${activeIntercompany.id}' (status: '${activeIntercompany.status}'). Close or cancel the intercompany contract first.`,
    );
  }

  await prisma.projectParticipant.delete({ where: { id } });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'project_participant.delete',
    resourceType: 'project_participant',
    resourceId: id,
    projectId: existing.projectId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeJson: existing as any,
    afterJson: null,
  });
}
