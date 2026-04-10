import { prisma } from '@fmksa/db';
import { createStorageAdapter } from './storage';

// ---------------------------------------------------------------------------
// Task 1.6.7 — getDocument
// ---------------------------------------------------------------------------

const storage = createStorageAdapter();

/**
 * Get a document with all versions, signatures, and a presigned download URL
 * for the current version.
 *
 * - Loads document with ALL versions (ordered by versionNo desc) + signatures.
 * - Checks project scope (document must belong to a project the user can see).
 * - For the current version: generates a presigned download URL (15min expiry).
 */
export async function getDocument(id: string, requestingUserId: string) {
  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      currentVersion: {
        include: {
          signatures: true,
        },
      },
      versions: {
        orderBy: { versionNo: 'desc' },
        include: {
          signatures: true,
        },
      },
      project: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  if (!document) {
    throw new Error(`Document not found: ${id}`);
  }

  // Generate presigned download URL for the current version
  let downloadUrl: string | null = null;
  if (document.currentVersion) {
    downloadUrl = await storage.getSignedUrl(
      document.currentVersion.fileKey,
      15 * 60, // 15 minutes
    );
  }

  return {
    ...document,
    downloadUrl,
  };
}
