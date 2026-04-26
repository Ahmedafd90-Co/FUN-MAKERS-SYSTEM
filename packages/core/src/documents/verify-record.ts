import { prisma } from '@fmksa/db';
import { assertProjectScope } from '../scope-binding';

/**
 * Record types that can have documents attached via the polymorphic FK on Document.
 * Adding a new type here is the only change needed to support attachments for that
 * record family — the upload flow, list filter, and detail-page card all work generically.
 *
 * The schema layer (CreateDocumentSchema.recordType) is intentionally loose (z.string().optional())
 * to preserve the polymorphic-by-design contract. This allowlist enforces validity at runtime
 * with fail-fast errors and clear messages.
 */
export const RECORD_TYPES_FOR_DOCUMENTS = [
  'expense',
  'purchase_order',
  'supplier_invoice',
  'credit_note',
] as const;

export type DocumentRecordType = (typeof RECORD_TYPES_FOR_DOCUMENTS)[number];

export class UnsupportedRecordTypeError extends Error {
  constructor(recordType: string) {
    super(
      `recordType '${recordType}' is not supported for document attachment. ` +
        `Supported types: ${RECORD_TYPES_FOR_DOCUMENTS.join(', ')}.`,
    );
    this.name = 'UnsupportedRecordTypeError';
  }
}

/**
 * Verify that the record (recordType, recordId) exists and belongs to projectId.
 * Throws on miss or mismatch. Used by createDocument when both recordType and recordId
 * are provided — protects against unconstrained polymorphic FK attaching to records
 * the user doesn't have access to.
 */
export async function verifyRecordInProject(
  recordType: string,
  recordId: string,
  projectId: string,
): Promise<void> {
  let record: { projectId: string };

  switch (recordType) {
    case 'expense':
      record = await prisma.expense.findUniqueOrThrow({
        where: { id: recordId },
        select: { projectId: true },
      });
      break;
    case 'purchase_order':
      record = await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: recordId },
        select: { projectId: true },
      });
      break;
    case 'supplier_invoice':
      record = await prisma.supplierInvoice.findUniqueOrThrow({
        where: { id: recordId },
        select: { projectId: true },
      });
      break;
    case 'credit_note':
      record = await prisma.creditNote.findUniqueOrThrow({
        where: { id: recordId },
        select: { projectId: true },
      });
      break;
    default:
      throw new UnsupportedRecordTypeError(recordType);
  }

  assertProjectScope(record, projectId, recordType, recordId);
}
