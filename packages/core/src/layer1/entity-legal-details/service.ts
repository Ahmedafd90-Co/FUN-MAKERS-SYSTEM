/**
 * EntityLegalDetails service — 1:1 sidecar to Entity for legal/commercial fields.
 *
 * Layer 1 — PR-A1 (PIC-8). Entity-scoped, not project-scoped. Upsert-only
 * (no separate create/update); the row is created on first save and updated on
 * subsequent saves. Banking fields stored plain in Phase 1; encryption is
 * deferred to Phase 4 polish.
 */
import { prisma } from '@fmksa/db';
import type { UpsertEntityLegalDetailsInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getEntityLegalDetails(entityId: string) {
  return prisma.entityLegalDetails.findUnique({
    where: { entityId },
  });
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

export async function upsertEntityLegalDetails(input: UpsertEntityLegalDetailsInput) {
  const entity = await prisma.entity.findUniqueOrThrow({
    where: { id: input.entityId },
  });
  if (entity.status === 'archived') {
    throw new Error(
      `Cannot upsert legal details: Entity '${input.entityId}' is archived.`,
    );
  }

  const existing = await prisma.entityLegalDetails.findUnique({
    where: { entityId: input.entityId },
  });

  const data = {
    taxId: input.taxId ?? null,
    registrationNumber: input.registrationNumber ?? null,
    jurisdiction: input.jurisdiction ?? null,
    registeredAddress: input.registeredAddress ?? null,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
    bankName: input.bankName ?? null,
    bankAccountNumber: input.bankAccountNumber ?? null,
    bankIban: input.bankIban ?? null,
    bankSwift: input.bankSwift ?? null,
    notes: input.notes ?? null,
    updatedBy: input.updatedBy,
  };

  const record = await prisma.entityLegalDetails.upsert({
    where: { entityId: input.entityId },
    create: { entityId: input.entityId, ...data },
    update: data,
  });

  await auditService.log({
    actorUserId: input.updatedBy,
    actorSource: 'user',
    action: existing ? 'entity_legal_details.update' : 'entity_legal_details.create',
    resourceType: 'entity_legal_details',
    resourceId: record.id,
    projectId: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeJson: existing as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterJson: record as any,
  });

  return record;
}

// ---------------------------------------------------------------------------
// Delete (rare — typically fields just go null via upsert)
// ---------------------------------------------------------------------------

export async function deleteEntityLegalDetails(entityId: string, actorUserId: string) {
  const existing = await prisma.entityLegalDetails.findUnique({
    where: { entityId },
  });
  if (!existing) {
    throw new Error(`No legal details exist for entity '${entityId}'.`);
  }

  await prisma.entityLegalDetails.delete({
    where: { entityId },
  });

  await auditService.log({
    actorUserId,
    actorSource: 'user',
    action: 'entity_legal_details.delete',
    resourceType: 'entity_legal_details',
    resourceId: existing.id,
    projectId: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeJson: existing as any,
    afterJson: null,
  });
}
