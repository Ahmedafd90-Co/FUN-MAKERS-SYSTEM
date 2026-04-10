/**
 * Posting tRPC router -- admin read operations for events + exceptions.
 *
 * Task 1.7.7: Phase 1.7 Group B
 *
 * IMPORTANT: There is NO posting.post endpoint. Business services call
 * postingService.post() directly from server-side code. This router only
 * exposes admin/read operations and exception management.
 */
import { TRPCError } from '@trpc/server';
import {
  ListPostingEventsInputSchema,
  GetPostingEventInputSchema,
  ListPostingExceptionsInputSchema,
  GetPostingExceptionInputSchema,
  RetryPostingExceptionInputSchema,
  ResolvePostingExceptionInputSchema,
} from '@fmksa/contracts';
import { postingExceptionService } from '@fmksa/core';
import { prisma } from '@fmksa/db';
import { router, adminProcedure } from '../trpc';

// ---------------------------------------------------------------------------
// Error mapping helper
// ---------------------------------------------------------------------------

function mapPostingError(err: unknown): never {
  if (err instanceof Error && err.message.includes('not found')) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof Error && err.message.includes('already resolved')) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Events sub-router (read-only admin operations)
// ---------------------------------------------------------------------------

const eventsRouter = router({
  /**
   * List posting events with optional filters and pagination.
   * Requires: posting.view (admin-level)
   */
  list: adminProcedure
    .input(ListPostingEventsInputSchema)
    .query(async ({ input }) => {
      const { projectId, eventType, status, skip, take } = input;

      const where: Record<string, unknown> = {};
      if (projectId) where.projectId = projectId;
      if (eventType) where.eventType = eventType;
      if (status) where.status = status;

      const [events, total] = await Promise.all([
        prisma.postingEvent.findMany({
          where,
          include: {
            project: { select: { id: true, name: true, code: true } },
            exceptions: {
              select: { id: true, reason: true, resolvedAt: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.postingEvent.count({ where }),
      ]);

      return { events, total, skip, take };
    }),

  /**
   * Get a single posting event with related exceptions.
   * Requires: posting.view (admin-level)
   */
  get: adminProcedure
    .input(GetPostingEventInputSchema)
    .query(async ({ input }) => {
      const event = await prisma.postingEvent.findUnique({
        where: { id: input.id },
        include: {
          project: { select: { id: true, name: true, code: true } },
          exceptions: true,
        },
      });

      if (!event) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `PostingEvent '${input.id}' not found.`,
        });
      }

      return event;
    }),
});

// ---------------------------------------------------------------------------
// Exceptions sub-router
// ---------------------------------------------------------------------------

const exceptionsRouter = router({
  /**
   * List posting exceptions with optional filters and pagination.
   * Requires: posting.view (admin-level)
   */
  list: adminProcedure
    .input(ListPostingExceptionsInputSchema)
    .query(async ({ input }) => {
      // Strip undefined values — exactOptionalPropertyTypes compat
      const filters: {
        status?: 'open' | 'resolved';
        projectId?: string;
        eventType?: string;
        skip?: number;
        take?: number;
      } = { skip: input.skip, take: input.take };
      if (input.status !== undefined) filters.status = input.status;
      if (input.projectId !== undefined) filters.projectId = input.projectId;
      if (input.eventType !== undefined) filters.eventType = input.eventType;
      return postingExceptionService.listExceptions(filters);
    }),

  /**
   * Get a single exception with its related event and audit logs.
   * Requires: posting.view (admin-level)
   */
  get: adminProcedure
    .input(GetPostingExceptionInputSchema)
    .query(async ({ input }) => {
      try {
        return await postingExceptionService.getException(input.id);
      } catch (err) {
        mapPostingError(err);
      }
    }),

  /**
   * Retry a failed exception by re-posting the original event data.
   * Requires: posting.retry (admin-level)
   */
  retry: adminProcedure
    .input(RetryPostingExceptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await postingExceptionService.retryException(
          input.exceptionId,
          ctx.user.id,
        );
        return {
          success: true as const,
          event: result.newEvent,
        };
      } catch (err) {
        // For retry failures, return structured error instead of throwing
        // so the UI can display it gracefully.
        if (
          err instanceof Error &&
          !err.message.includes('not found') &&
          !err.message.includes('already resolved')
        ) {
          return {
            success: false as const,
            error: err.message,
          };
        }
        mapPostingError(err);
      }
    }),

  /**
   * Manually resolve an exception with a required note.
   * Requires: posting.resolve (admin-level)
   */
  resolve: adminProcedure
    .input(ResolvePostingExceptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await postingExceptionService.resolveException(
          input.exceptionId,
          input.note,
          ctx.user.id,
        );
      } catch (err) {
        mapPostingError(err);
      }
    }),
});

// ---------------------------------------------------------------------------
// Composed posting router
// ---------------------------------------------------------------------------

export const postingRouter = router({
  events: eventsRouter,
  exceptions: exceptionsRouter,
});
