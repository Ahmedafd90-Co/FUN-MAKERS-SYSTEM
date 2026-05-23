import { z } from 'zod';

// ---------------------------------------------------------------------------
// Task 1.6.8 — Document Zod schemas (contracts)
// ---------------------------------------------------------------------------

export const DocumentCategorySchema = z.enum([
  'shop_drawing',
  'material_submittal',
  'test_certificate',
  'contract_attachment',
  'vendor_document',
  'letter',
  'drawing',
  'specification',
  'general',
]);

export type DocumentCategory = z.infer<typeof DocumentCategorySchema>;

export const DocumentStatusSchema = z.enum([
  'draft',
  'in_review',
  'approved',
  'signed',
  'superseded',
  'archived',
]);

export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

// ---------------------------------------------------------------------------
// PIC-51 — recordType registry (canonical source in @fmksa/contracts)
//
// Record types that can have documents attached via Document.recordType +
// Document.recordId (polymorphic FK). To add a new recordType, do all three
// of the following atomically in one PR:
//
//   1. PUSH the new value to RECORD_TYPES_FOR_DOCUMENTS below.
//   2. ADD a switch case in `verifyRecordInProject` in
//      packages/core/src/documents/verify-record.ts that does
//      `prisma.<model>.findUniqueOrThrow({ where: { id: recordId },
//      select: { projectId: true } })`.
//   3. SHIP them together. The parity-guard test
//      (`packages/core/tests/documents/verify-record-parity.test.ts`)
//      will fail if (1) was done without (2). Drift between this const
//      and the switch is the PIC-50 class of silent-mis-resolution at
//      the Document-attachment layer; we catch it structurally.
//
// The const lives in @fmksa/contracts (not @fmksa/core) because the Zod
// schemas below need it at compile time to declare `recordType` as an
// enum. @fmksa/core depends on @fmksa/contracts, not vice versa — moving
// the const TO contracts gives one direction of dependency, no cycle.
// ---------------------------------------------------------------------------

export const RECORD_TYPES_FOR_DOCUMENTS = [
  'expense',
  'purchase_order',
  'supplier_invoice',
  'credit_note',
  // PIC-52 — Drawing Register: each DrawingRevision attaches its drawing file
  // as a Document via this polymorphic FK. The Drawing header entity itself
  // does NOT attach a Document; only the per-revision file does.
  'drawing_revision',
] as const;

export type DocumentRecordType = (typeof RECORD_TYPES_FOR_DOCUMENTS)[number];

export const DocumentRecordTypeSchema = z.enum(RECORD_TYPES_FOR_DOCUMENTS);

export const CreateDocumentSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(255),
  category: DocumentCategorySchema,
  recordType: DocumentRecordTypeSchema.optional(),
  recordId: z.string().uuid().optional(),
});

export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;

export const UploadVersionSchema = z.object({
  documentId: z.string().uuid(),
  // File data handled separately via multipart — this is metadata only
});

export type UploadVersionInput = z.infer<typeof UploadVersionSchema>;

export const SignVersionSchema = z.object({
  versionId: z.string().uuid(),
});

export type SignVersionInput = z.infer<typeof SignVersionSchema>;

export const SupersedeVersionSchema = z.object({
  documentId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required for supersession'),
});

export type SupersedeVersionInput = z.infer<typeof SupersedeVersionSchema>;

export const ListDocumentsSchema = z.object({
  projectId: z.string().uuid(),
  category: DocumentCategorySchema.optional(),
  status: DocumentStatusSchema.optional(),
  search: z.string().optional(),
  recordType: DocumentRecordTypeSchema.optional(),
  recordId: z.string().uuid().optional(),
  skip: z.number().int().min(0).default(0),
  take: z.number().int().min(1).max(100).default(20),
});

export type ListDocumentsInput = z.infer<typeof ListDocumentsSchema>;
