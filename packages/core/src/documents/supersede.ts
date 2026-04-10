import { createHash } from 'node:crypto';
import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import { createStorageAdapter } from './storage';

// ---------------------------------------------------------------------------
// Task 1.6.6 — supersedeVersion
// ---------------------------------------------------------------------------

const storage = createStorageAdapter();

export interface SupersedeVersionInput {
  documentId: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  uploadedBy: string;
  reason: string;
}

/**
 * Supersede the current version of a document with a new file.
 *
 * - Reason is REQUIRED.
 * - Uploads new file and creates a new DocumentVersion.
 * - On the OLD version: sets supersededAt + supersededByVersionId.
 *   (This is the ONLY update allowed on a signed version — the Prisma
 *   middleware permits it.)
 * - Updates Document.currentVersionId to the new version.
 * - Updates Document.status back to 'in_review' (re-review needed).
 * - Writes audit log with reason.
 */
export async function supersedeVersion(input: SupersedeVersionInput) {
  const { documentId, fileBuffer, fileName, mimeType, uploadedBy, reason } =
    input;

  if (!reason || reason.trim().length === 0) {
    throw new Error('Reason is required for supersession.');
  }

  // Compute SHA-256 hash of new file
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

  // Load document with current version
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      currentVersion: true,
      versions: { orderBy: { versionNo: 'desc' }, take: 1 },
    },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  if (!document.currentVersion) {
    throw new Error(
      `Document ${documentId} has no current version to supersede.`,
    );
  }

  const oldVersion = document.currentVersion;

  // Determine next version number
  const lastVersionNo = document.versions[0]?.versionNo ?? 0;
  const versionNo = lastVersionNo + 1;

  // Generate file key
  const fileKey = `projects/${document.projectId}/documents/${documentId}/${versionNo}/${fileName}`;

  // Upload new file to storage
  await storage.upload({
    key: fileKey,
    body: fileBuffer,
    contentType: mimeType,
    contentLength: fileBuffer.length,
  });

  // Create new version and supersede old one in a transaction
  const result = await (prisma as any).$transaction(async (tx: any) => {
    // Create the new version
    const newVersion = await tx.documentVersion.create({
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

    // Supersede the old version (ONLY allowed mutation on signed versions)
    await tx.documentVersion.update({
      where: { id: oldVersion.id },
      data: {
        supersededAt: new Date(),
        supersededByVersionId: newVersion.id,
      },
    });

    // Update document: new current version, status back to in_review
    await tx.document.update({
      where: { id: documentId },
      data: {
        currentVersionId: newVersion.id,
        status: 'in_review',
      },
    });

    await auditService.log(
      {
        actorUserId: uploadedBy,
        actorSource: 'user',
        action: 'document.supersede_version',
        resourceType: 'document_version',
        resourceId: newVersion.id,
        projectId: document.projectId,
        beforeJson: {
          currentVersionId: oldVersion.id,
          currentVersionNo: oldVersion.versionNo,
          status: document.status,
        },
        afterJson: {
          newVersionId: newVersion.id,
          newVersionNo: versionNo,
          supersededVersionId: oldVersion.id,
          reason,
          status: 'in_review',
        },
        reason,
      },
      tx,
    );

    return { oldVersion, newVersion };
  });

  return result;
}
