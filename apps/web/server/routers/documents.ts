/**
 * Documents tRPC router — Task 1.6.9
 *
 * All procedures are project-scoped via projectProcedure.
 * File uploads are handled by a separate Next.js API route (/api/upload)
 * since tRPC does not support multipart/form-data natively.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  CreateDocumentSchema,
  ListDocumentsSchema,
  SignVersionSchema,
  SupersedeVersionSchema,
  DocumentCategorySchema,
  DocumentStatusSchema,
} from '@fmksa/contracts';
import { documentService, accessControlService, createStorageAdapter } from '@fmksa/core';
import { router, projectProcedure } from '../trpc';

// ---------------------------------------------------------------------------
// Documents router
// ---------------------------------------------------------------------------

export const documentsRouter = router({
  /**
   * Create a new document (metadata only — file upload handled separately).
   * Requires: document.upload permission.
   */
  create: projectProcedure
    .input(CreateDocumentSchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'document.upload',
        input.projectId,
      );

      return documentService.createDocument({
        projectId: input.projectId,
        title: input.title,
        category: input.category,
        ...(input.recordType != null ? { recordType: input.recordType } : {}),
        ...(input.recordId != null ? { recordId: input.recordId } : {}),
        createdBy: ctx.user.id,
      });
    }),

  /**
   * List documents for a project with optional filters and pagination.
   * Requires: document.view permission.
   */
  list: projectProcedure
    .input(ListDocumentsSchema)
    .query(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'document.view',
        input.projectId,
      );

      return documentService.listDocuments({
        projectId: input.projectId,
        ...(input.category != null ? { category: input.category } : {}),
        ...(input.status != null ? { status: input.status } : {}),
        ...(input.search != null ? { search: input.search } : {}),
        ...(input.recordType != null ? { recordType: input.recordType } : {}),
        ...(input.recordId != null ? { recordId: input.recordId } : {}),
        skip: input.skip,
        take: input.take,
      });
    }),

  /**
   * Get a single document with all versions, signatures, and download URL.
   * Requires: document.view permission.
   */
  get: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        documentId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'document.view',
        input.projectId,
      );

      const doc = await documentService.getDocument(
        input.documentId,
        ctx.user.id,
      );

      // Verify the document belongs to this project
      if (doc.projectId !== input.projectId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found in this project.',
        });
      }

      return doc;
    }),

  /**
   * Sign the current version of a document (internal hash signing).
   * Requires: document.sign permission.
   */
  sign: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        versionId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'document.sign',
        input.projectId,
      );

      try {
        return await documentService.signVersion({
          versionId: input.versionId,
          signerUserId: ctx.user.id,
          ip: '0.0.0.0', // IP resolved at edge, not available in tRPC context
          userAgent: 'fmksa-web',
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'IntegrityError') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /**
   * Supersede the current version with a new file.
   * Requires: document.supersede permission.
   *
   * Note: The actual file upload + supersession is handled by the
   * /api/upload API route. This procedure is available for metadata-only
   * supersession if needed in the future.
   */
  supersede: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        documentId: z.string().uuid(),
        reason: z.string().min(1, 'Reason is required for supersession'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'document.supersede',
        input.projectId,
      );

      // This returns the metadata needed for the client to proceed with
      // file upload via /api/upload. The actual supersession happens there.
      return {
        documentId: input.documentId,
        reason: input.reason,
        userId: ctx.user.id,
        authorized: true,
      };
    }),

  /**
   * Get a presigned download URL for a specific version.
   * Requires: document.view permission.
   */
  getDownloadUrl: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        fileKey: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'document.view',
        input.projectId,
      );

      const storage = createStorageAdapter();
      const url = await storage.getSignedUrl(input.fileKey, 15 * 60);

      return { url };
    }),
});
