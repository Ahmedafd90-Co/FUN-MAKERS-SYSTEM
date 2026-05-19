import { prisma } from '@fmksa/db';
import { RECORD_TYPES_FOR_DOCUMENTS, type DocumentRecordType } from '@fmksa/contracts';
import { assertProjectScope } from '../scope-binding';

/**
 * Document attachment recordType registry — verification side.
 *
 * The canonical source of registered recordTypes lives in `@fmksa/contracts`
 * (`RECORD_TYPES_FOR_DOCUMENTS`) so the Zod schemas there can declare
 * `recordType` as an enum at compile time. This file holds the runtime
 * verification: a switch statement that calls `prisma.<model>.findUniqueOrThrow`
 * per registered type and then asserts the record belongs to the caller's
 * project scope.
 *
 * # Convention for adding a new recordType (PIC-51)
 *
 * To add a new recordType for Document attachment, do ALL THREE atomically in
 * ONE PR:
 *
 *   1. PUSH the new value to `RECORD_TYPES_FOR_DOCUMENTS` in
 *      `packages/contracts/src/documents.ts` (the canonical source). The Zod
 *      enum `DocumentRecordTypeSchema` derives from it; the API boundary
 *      `CreateDocumentSchema.recordType` then rejects unregistered types at
 *      parse time.
 *
 *   2. ADD a switch case in `verifyRecordInProject` (below) that does:
 *        case 'X':
 *          record = await prisma.x.findUniqueOrThrow({
 *            where: { id: recordId },
 *            select: { projectId: true },
 *          });
 *          break;
 *      The case falls through to the shared `assertProjectScope` call at the
 *      end — do not duplicate the scope check inside the case.
 *
 *   3. SHIP them together as one atomic change. The parity-guard test at
 *      `packages/core/tests/documents/verify-record-parity.test.ts` WILL fail
 *      if (1) was done without (2). This is intentional — drift between the
 *      const and the switch is the PIC-50 class of silent-mis-resolution at
 *      this layer (registered type with no handler = runtime
 *      UnsupportedRecordTypeError even though the API accepted it), and we
 *      catch it structurally rather than by human discipline.
 *
 * # Failure modes the parity-guard catches
 *
 *   - Const entry without a switch case → for that registered type, the
 *     switch falls through to `default` and throws
 *     `UnsupportedRecordTypeError` at runtime. The parity test detects this
 *     by calling `verifyRecordInProject` with each registered type and a
 *     fake UUID; it expects EITHER a Prisma not-found error (case exists)
 *     OR no error, but never `UnsupportedRecordTypeError`.
 *
 *   - Switch case without a const entry → the API-boundary Zod enum
 *     rejects the type before it reaches the switch, so the case is dead
 *     code. Not load-bearing but should be removed for hygiene; the parity
 *     test's symmetric direction (Zod-schema-accepts-every-const-value)
 *     catches it.
 */

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
 * Throws on miss or mismatch. Used by createDocument when both recordType and
 * recordId are provided — protects against unconstrained polymorphic FK
 * attaching to records the user doesn't have access to.
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

// Re-export the canonical source from @fmksa/contracts so existing
// `import { RECORD_TYPES_FOR_DOCUMENTS } from '@fmksa/core'` call sites
// continue to work without changes.
export { RECORD_TYPES_FOR_DOCUMENTS, type DocumentRecordType };
