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
  const counter = await (tx as any).referenceCounter.upsert({
    where: {
      projectId_typeCode: { projectId, typeCode },
    },
    update: {
      lastNumber: { increment: 1 },
    },
    create: {
      projectId,
      typeCode,
      lastNumber: 1,
    },
  });

  const project = await (tx as any).project.findUniqueOrThrow({
    where: { id: projectId },
    select: { code: true },
  });

  const paddedNumber = String(counter.lastNumber).padStart(3, '0');
  return `${project.code}-${typeCode}-${paddedNumber}`;
}
