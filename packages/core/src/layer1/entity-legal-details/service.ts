/**
 * EntityLegalDetails service — 1:1 sidecar to Entity for legal/commercial fields.
 *
 * Layer 1 — PR-A1 (PIC-8). Entity-scoped, not project-scoped. Upsert-only
 * (no separate create/update); the row is created on first save and updated on
 * subsequent saves. Banking fields stored plain in Phase 1; encryption is
 * deferred to Phase 4 polish.
 *
 * Update semantics for partial upserts:
 *   undefined → field not changed (key omitted from input)
 *   null      → field explicitly cleared
 *   value     → field set to value
 *
 * On create, fields not present in input default to NULL (Prisma schema default
 * for nullable columns).
 */
import { prisma } from '@fmksa/db';
import type { UpsertEntityLegalDetailsInput } from '@fmksa/contracts';
import { auditService } from '../../audit/service';

// Fields that follow the partial-update semantics (undefined = leave unchanged).
// updatedBy and entityId are always required and handled separately.
const MUTABLE_FIELDS = [
  'taxId',
  'registrationNumber',
  'jurisdiction',
  'registeredAddress',
  'contactName',
  'contactEmail',
  'contactPhone',
  'bankName',
  'bankAccountNumber',
  'bankIban',
  'bankSwift',
  'notes',
] as const;

// ---------------------------------------------------------------------------
// Audit redaction — banking + contact fields are PII; mask before serializing
// to audit_log so audit-log readers can't see raw IBANs / account numbers /
// contact details. Last 4 chars preserved for traceability where useful.
// ---------------------------------------------------------------------------

function redactSensitiveFields<T extends Record<string, unknown> | null>(record: T): T {
  if (!record) return record;
  const redacted: Record<string, unknown> = { ...record };
  const maskTrailing = (value: unknown): string | unknown => {
    if (typeof value !== 'string' || value.length === 0) return value;
    if (value.length <= 4) return '*'.repeat(value.length);
    return '*'.repeat(value.length - 4) + value.slice(-4);
  };
  if ('bankIban' in redacted) redacted.bankIban = maskTrailing(redacted.bankIban);
  if ('bankAccountNumber' in redacted)
    redacted.bankAccountNumber = maskTrailing(redacted.bankAccountNumber);
  if ('bankSwift' in redacted) redacted.bankSwift = maskTrailing(redacted.bankSwift);
  if ('contactPhone' in redacted)
    redacted.contactPhone = maskTrailing(redacted.contactPhone);
  if (typeof redacted.contactEmail === 'string') {
    redacted.contactEmail = redacted.contactEmail.replace(/^(.{2}).*@/, '$1***@');
  }
  return redacted as T;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getEntityLegalDetails(entityId: string) {
  return prisma.entityLegalDetails.findUnique({
    where: { entityId },
  });
}

// ---------------------------------------------------------------------------
// Upsert — preserves omitted fields (no clobbering)
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

  // Build update data: only include keys whose value is present (not undefined).
  // null is preserved as an explicit clear.
  const updateData: Record<string, unknown> = { updatedBy: input.updatedBy };
  for (const key of MUTABLE_FIELDS) {
    if (input[key] !== undefined) {
      updateData[key] = input[key];
    }
  }

  // Build create data: same omission semantics (omitted → DB default = null).
  const createData: Record<string, unknown> = {
    entityId: input.entityId,
    updatedBy: input.updatedBy,
  };
  for (const key of MUTABLE_FIELDS) {
    if (input[key] !== undefined) {
      createData[key] = input[key];
    }
  }

  const record = await prisma.entityLegalDetails.upsert({
    where: { entityId: input.entityId },
    create: createData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    update: updateData as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  await auditService.log({
    actorUserId: input.updatedBy,
    actorSource: 'user',
    action: existing ? 'entity_legal_details.update' : 'entity_legal_details.create',
    resourceType: 'entity_legal_details',
    resourceId: record.id,
    projectId: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeJson: redactSensitiveFields(existing as Record<string, unknown> | null) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterJson: redactSensitiveFields(record as unknown as Record<string, unknown>) as any,
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
    beforeJson: redactSensitiveFields(existing as unknown as Record<string, unknown>) as any,
    afterJson: null,
  });
}
