/**
 * Sheet-import tRPC router.
 *
 * All mutating procedures are project-scoped. Staging, validation, and review
 * are all project-scoped; batch listing and detail are project-scoped as
 * well so the UI can land on a specific project's import queue.
 *
 * Upload (binary multipart) is NOT handled here — see
 * `apps/web/app/api/imports/upload/route.ts`. That REST endpoint parses the
 * multipart form and then calls `stageBatch()` directly from core. The router
 * below only orchestrates validate → exclude → commit → reject → cancel and
 * the list/detail reads.
 *
 * Permissions:
 *   import.view    — list + get batch
 *   import.create  — stage (handled in REST route; router does not expose)
 *   import.commit  — validate, commit, exclude row
 *   import.reject  — reject, cancel
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  validateBatch,
  commitBatch,
  rejectBatch,
  cancelBatch,
  excludeRow,
  listBatches,
  getBatch,
  DuplicateImportError,
  StaleValidationError,
  ImportBatchNotReadyError,
} from '@fmksa/core';
import { router, projectProcedure, protectedProcedure } from '../trpc';

function hasPerm(
  ctx: { user: { permissions: string[] } },
  perm: string,
): boolean {
  return (
    ctx.user.permissions.includes('system.admin') ||
    ctx.user.permissions.includes(perm)
  );
}

function handleImportError(err: unknown): never {
  if (err instanceof DuplicateImportError) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof StaleValidationError) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof ImportBatchNotReadyError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: err.message,
      cause: err,
    });
  }
  throw err;
}

export const importRouter = router({
  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** List batches for a project (paginated). */
  list: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        importType: z.enum(['budget_baseline', 'ipa_history']).optional(),
        status: z
          .enum([
            'staged',
            'validated',
            'partially_valid',
            'committed',
            'rejected',
            'cancelled',
          ])
          .optional(),
        skip: z.number().int().min(0).default(0),
        take: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'import.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      return listBatches({
        projectId: input.projectId,
        importType: input.importType ?? null,
        status: input.status ?? null,
        skip: input.skip,
        take: input.take,
      });
    }),

  /** Get a single batch + its rows for the review queue. */
  get: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        batchId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'import.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      const batch = await getBatch(input.batchId);
      if (batch.projectId !== input.projectId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Batch does not belong to this project.',
        });
      }
      return batch;
    }),

  /**
   * Admin-only batch detail lookup (no projectId required).
   *
   * Used by the admin Imports review queue UI, which navigates to a batch
   * by batchId alone. Still enforces `import.view` (or `system.admin`).
   */
  getAdmin: protectedProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'import.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      return getBatch(input.batchId);
    }),

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /** Run validators against a staged batch. */
  validate: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        batchId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'import.commit')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      try {
        return await validateBatch(input.batchId, ctx.user.id);
      } catch (err) {
        handleImportError(err);
      }
    }),

  /** Exclude (skip) a single row from commit. */
  excludeRow: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        rowId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'import.commit')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      return excludeRow(input.rowId, ctx.user.id);
    }),

  /** Commit all valid rows — write live records + post ledger events. */
  commit: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        batchId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'import.commit')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      try {
        return await commitBatch(input.batchId, ctx.user.id);
      } catch (err) {
        handleImportError(err);
      }
    }),

  /** Reject a staged / validated / partially valid batch — live untouched. */
  reject: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        batchId: z.string().uuid(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'import.reject')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      try {
        return await rejectBatch(
          input.batchId,
          { reason: input.reason },
          ctx.user.id,
        );
      } catch (err) {
        handleImportError(err);
      }
    }),

  /** Cancel a staged batch before validation/commit — live untouched. */
  cancel: projectProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        batchId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'import.reject')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      try {
        return await cancelBatch(input.batchId, ctx.user.id);
      } catch (err) {
        handleImportError(err);
      }
    }),

  // -------------------------------------------------------------------------
  // Admin-wide: cross-project list (for admin Imports nav)
  // -------------------------------------------------------------------------

  /** Cross-project list for admins. */
  listAll: protectedProcedure
    .input(
      z
        .object({
          importType: z.enum(['budget_baseline', 'ipa_history']).optional(),
          status: z
            .enum([
              'staged',
              'validated',
              'partially_valid',
              'committed',
              'rejected',
              'cancelled',
            ])
            .optional(),
          skip: z.number().int().min(0).default(0),
          take: z.number().int().min(1).max(100).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'import.view')) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      }
      return listBatches({
        projectId: null,
        importType: input?.importType ?? null,
        status: input?.status ?? null,
        skip: input?.skip ?? 0,
        take: input?.take ?? 20,
      });
    }),
});
