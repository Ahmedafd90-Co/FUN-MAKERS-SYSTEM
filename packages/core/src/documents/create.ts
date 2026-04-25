import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { verifyRecordInProject } from './verify-record';

// ---------------------------------------------------------------------------
// Task 1.6.2 — createDocument
// ---------------------------------------------------------------------------

/**
 * Valid document categories — must match the Prisma DocumentCategory enum.
 */
const VALID_CATEGORIES = new Set([
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

export interface CreateDocumentInput {
  projectId: string;
  recordType?: string;
  recordId?: string;
  title: string;
  category: string;
  createdBy: string;
}

/**
 * Create a new Document in draft status with no versions yet.
 *
 * - Validates: project exists, category is a valid DocumentCategory.
 * - Sets status = 'draft', currentVersionId = null.
 * - Writes audit log.
 */
export async function createDocument(input: CreateDocumentInput) {
  const { projectId, recordType, recordId, title, category, createdBy } = input;

  // Validate category
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(
      `Invalid document category "${category}". Valid categories: ${[...VALID_CATEGORIES].join(', ')}`,
    );
  }

  // Validate project exists
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // If this document is being attached to a specific record (polymorphic FK),
  // verify the target exists and is in the same project. This protects against
  // attaching to records in other projects.
  if (recordType != null && recordId != null) {
    await verifyRecordInProject(recordType, recordId, projectId);
  }

  // Create document in a transaction with audit log
  const document = await (prisma as any).$transaction(async (tx: any) => {
    const doc = await tx.document.create({
      data: {
        projectId,
        recordType: recordType ?? null,
        recordId: recordId ?? null,
        title,
        category: category as any,
        status: 'draft',
        currentVersionId: null,
        createdBy,
      },
    });

    await auditService.log(
      {
        actorUserId: createdBy,
        actorSource: 'user',
        action: 'document.create',
        resourceType: 'document',
        resourceId: doc.id,
        projectId,
        beforeJson: {},
        afterJson: {
          id: doc.id,
          title,
          category,
          status: 'draft',
          projectId,
        },
      },
      tx,
    );

    return doc;
  });

  return document;
}
