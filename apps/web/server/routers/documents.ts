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
import { prisma } from '@fmksa/db';
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

      // PIC-71 PR-2 (β-sweep): pass input.projectId so the service-level
      // assertProjectScope binds the read at @fmksa/core. Router check stays
      // as belt-and-suspenders + fast-fail before the service tries the read.
      // Both layers see input.projectId so the AST guard sees the service has
      // its own scope binding (PD 6fec748d Path A).
      let doc;
      try {
        doc = await documentService.getDocument(
          input.documentId,
          ctx.user.id,
          input.projectId,
        );
      } catch (err) {
        if ((err as { name?: string }).name === 'ScopeMismatchError') {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Document not found in this project.',
          });
        }
        throw err;
      }

      // Defensive: keep the router-level check so a future service refactor
      // that drops the assert wouldn't silently un-protect the read.
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

      // PIC-97 hotfix: tenant scope — pre-fetch the version with its document
      // and verify the document belongs to this project (mirror the documents.get
      // line-96 idiom). Router-asserted; flagged for PR-2 honesty note.
      const versionScope = await prisma.documentVersion.findUnique({
        where: { id: input.versionId },
        select: { document: { select: { projectId: true } } },
      });
      if (!versionScope || versionScope.document.projectId !== input.projectId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document version not found in this project.',
        });
      }

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

      // PIC-97 hotfix: tenant scope — verify the document belongs to this
      // project before returning the `authorized: true` stamp. /api/upload
      // re-checks scope at handleSupersede (route.ts:310), so DB mutation
      // was already blocked, but the unguarded stamp + existence-disclosure
      // was a real cross-tenant leak. Router-asserted; flagged for PR-2
      // honesty note.
      const docScope = await prisma.document.findUnique({
        where: { id: input.documentId },
        select: { projectId: true },
      });
      if (!docScope || docScope.projectId !== input.projectId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found in this project.',
        });
      }

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

      // PIC-97 hotfix: tenant scope — F3 hardened the document/version reads
      // via the documentId path but getDownloadUrl is keyed on fileKey, which
      // means org-A could request a presigned URL for any known/guessed org-B
      // fileKey. Pre-fetch the DocumentVersion by fileKey and verify the
      // document belongs to this project. Router-asserted; flagged for PR-2
      // honesty note.
      const versionScope = await prisma.documentVersion.findFirst({
        where: { fileKey: input.fileKey },
        select: { document: { select: { projectId: true } } },
      });
      if (!versionScope || versionScope.document.projectId !== input.projectId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document version not found in this project.',
        });
      }

      const storage = createStorageAdapter();
      const url = await storage.getSignedUrl(input.fileKey, 15 * 60);

      return { url };
    }),
});
