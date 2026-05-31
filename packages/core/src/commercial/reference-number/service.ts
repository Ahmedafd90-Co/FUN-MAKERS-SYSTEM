import { prisma } from '@fmksa/db';

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Generate a project-scoped sequential reference number.
 * Format: {ProjectCode}-{TypeCode}-{NNN}
 *
 * MUST be called inside a Prisma transaction to guarantee atomicity.
 */
export async function generateReferenceNumber(
  projectId: string,
  typeCode: string,
  tx: TransactionClient,
): Promise<string> {
  // PIC-84: derive orgId from the project so the counter is per-tenant
  // (org_id, project_id, type_code). Callers unchanged — orgId stays internal.
  const project = await (tx as any).project.findUniqueOrThrow({
    where: { id: projectId },
    select: { code: true, orgId: true },
  });

  const counter = await (tx as any).referenceCounter.upsert({
    where: {
      orgId_projectId_typeCode: { orgId: project.orgId, projectId, typeCode },
    },
    update: {
      lastNumber: { increment: 1 },
    },
    create: {
      orgId: project.orgId,
      projectId,
      typeCode,
      lastNumber: 1,
    },
  });

  const paddedNumber = String(counter.lastNumber).padStart(3, '0');
  return `${project.code}-${typeCode}-${paddedNumber}`;
}

/**
 * PIC-84 (F2 Batch 3) — generate a per-ORG sequential number with a caller-supplied
 * formatter, via the atomic OrgSequenceCounter (upsert + increment). Replaces the
 * fragile read-max+retry-once generators for FA/VC/RFQ. The bare XX-NNNN format is
 * supplied by the caller (no project code), so existing values are unchanged.
 *
 * MUST be called inside a Prisma transaction. orgId is derived by the caller from
 * the entity (FA) or project (VC/RFQ) — no ctx.orgId; UNENFORCED until F3.
 */
export async function generateOrgScopedNumber(
  orgId: string,
  typeCode: string,
  format: (n: number) => string,
  tx: TransactionClient,
): Promise<string> {
  const counter = await (tx as any).orgSequenceCounter.upsert({
    where: { orgId_typeCode: { orgId, typeCode } },
    update: { lastNumber: { increment: 1 } },
    create: { orgId, typeCode, lastNumber: 1 },
  });
  return format(counter.lastNumber);
}
