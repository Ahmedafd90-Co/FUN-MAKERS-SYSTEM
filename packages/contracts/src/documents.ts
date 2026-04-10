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

export const CreateDocumentSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(255),
  category: DocumentCategorySchema,
  recordType: z.string().optional(),
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
  skip: z.number().int().min(0).default(0),
  take: z.number().int().min(1).max(100).default(20),
});

export type ListDocumentsInput = z.infer<typeof ListDocumentsSchema>;
