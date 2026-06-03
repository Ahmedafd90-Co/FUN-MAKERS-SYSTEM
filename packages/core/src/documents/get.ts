import { prisma } from '@fmksa/db';
import { createStorageAdapter } from './storage';
import { assertProjectScope } from '../scope-binding';

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
 *
 * PIC-71 PR-2 (β-sweep): `expectedProjectId` is the chokepoint-validated project
 * scope from the caller. Asserts `document.projectId === expectedProjectId`
 * (mirrors documents.get router's existing line-96 idiom — belt-and-suspenders
 * per PD 6fec748d Path A). Router assert stays; service gains its own so the
 * static-AST guard sees it AND a future router refactor cannot silently
 * un-protect the read.
 */
export async function getDocument(
  id: string,
  requestingUserId: string,
  expectedProjectId: string,
) {
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

  // PIC-71 PR-2 (β-sweep): tenant scope at the service layer.
  assertProjectScope(document, expectedProjectId, 'Document', id);

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
