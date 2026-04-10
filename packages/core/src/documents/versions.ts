import { createHash } from 'node:crypto';
import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { createStorageAdapter } from './storage';

// ---------------------------------------------------------------------------
// Task 1.6.3 — uploadVersion
// ---------------------------------------------------------------------------

const storage = createStorageAdapter();

export interface UploadVersionInput {
  documentId: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  uploadedBy: string;
}

/**
 * Upload a new version for an existing document.
 *
 * - Computes SHA-256 hash of fileBuffer.
 * - Generates file key: projects/{projectId}/documents/{documentId}/{versionNo}/{fileName}
 * - Uploads to storage via adapter.
 * - Creates DocumentVersion row (auto-increment versionNo).
 * - Updates Document.currentVersionId to new version.
 * - Updates Document.status to 'in_review' if it was 'draft'.
 * - Writes audit log.
 */
export async function uploadVersion(input: UploadVersionInput) {
  const { documentId, fileBuffer, fileName, mimeType, uploadedBy } = input;

  // Compute SHA-256 hash
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

  // Load the document
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  // Determine next version number
  const lastVersionNo = document.versions[0]?.versionNo ?? 0;
  const versionNo = lastVersionNo + 1;

  // Generate file key
  const fileKey = `projects/${document.projectId}/documents/${documentId}/${versionNo}/${fileName}`;

  // Upload to storage
  await storage.upload({
    key: fileKey,
    body: fileBuffer,
    contentType: mimeType,
    contentLength: fileBuffer.length,
  });

  // Create version and update document in a transaction
  const version = await (prisma as any).$transaction(async (tx: any) => {
    const ver = await tx.documentVersion.create({
      data: {
        documentId,
        versionNo,
        fileKey,
        fileHash,
        fileSize: fileBuffer.length,
        mimeType,
        uploadedBy,
        uploadedAt: new Date(),
      },
    });

    // Update document: set currentVersionId, and advance status if draft
    const newStatus =
      document.status === 'draft' ? 'in_review' : document.status;

    await tx.document.update({
      where: { id: documentId },
      data: {
        currentVersionId: ver.id,
        status: newStatus,
      },
    });

    await auditService.log(
      {
        actorUserId: uploadedBy,
        actorSource: 'user',
        action: 'document.upload_version',
        resourceType: 'document_version',
        resourceId: ver.id,
        projectId: document.projectId,
        beforeJson: {
          currentVersionId: document.currentVersionId,
          status: document.status,
        },
        afterJson: {
          versionNo,
          fileKey,
          fileHash,
          fileSize: fileBuffer.length,
          mimeType,
          currentVersionId: ver.id,
          status: newStatus,
        },
      },
      tx,
    );

    return ver;
  });

  return version;
}
