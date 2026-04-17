import { prisma } from '@fmksa/db';

// ---------------------------------------------------------------------------
// Task 1.6.4 — listDocuments
// ---------------------------------------------------------------------------

export interface ListDocumentsInput {
  projectId: string;
  category?: string;
  status?: string;
  search?: string;
  /**
   * Polymorphic record filter — when both are set, limits the result to
   * Documents whose `recordType` + `recordId` match. Additive to existing
   * filters; existing callers that omit these two fields see unchanged
   * behaviour.
   */
  recordType?: string;
  recordId?: string;
  skip?: number;
  take?: number;
}

/**
 * List documents for a project with optional filters and pagination.
 *
 * - Filters by projectId (required), category, status, and title search (ilike).
 * - Includes current version metadata (fileSize, mimeType, uploadedAt).
 * - Returns paginated result { items, total }.
 */
export async function listDocuments(input: ListDocumentsInput) {
  const {
    projectId,
    category,
    status,
    search,
    recordType,
    recordId,
    skip = 0,
    take = 20,
  } = input;

  // Build where clause
  const where: any = { projectId };

  if (category) {
    where.category = category;
  }

  if (status) {
    where.status = status;
  }

  if (search) {
    where.title = {
      contains: search,
      mode: 'insensitive',
    };
  }

  if (recordType) {
    where.recordType = recordType;
  }

  if (recordId) {
    where.recordId = recordId;
  }

  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        currentVersion: {
          select: {
            id: true,
            versionNo: true,
            fileSize: true,
            mimeType: true,
            uploadedAt: true,
            isSigned: true,
            signedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.document.count({ where }),
  ]);

  return { items, total };
}
