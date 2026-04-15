/**
 * Financial reconciliation tRPC router.
 *
 * Exposes posting-ledger reconciliation as an admin-accessible endpoint.
 * Project-first design: reconciliation runs per project, not cross-project.
 *
 * Permissions: posting.view (same as viewing posting events/exceptions).
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { reconcileProjectFinancials } from '@fmksa/core';
import { prisma } from '@fmksa/db';
import { router, protectedProcedure } from '../trpc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasPerm(ctx: { user: { permissions: string[] } }, perm: string): boolean {
  return ctx.user.permissions.includes('system.admin') || ctx.user.permissions.includes(perm);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const reconciliationRouter = router({
  /**
   * Run full reconciliation for a single project.
   * Returns per-KPI three-way comparison (source / ledger / displayed).
   */
  reconcileProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'posting.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });

      return reconcileProjectFinancials(input.projectId);
    }),

  /**
   * List projects with basic reconciliation status (summary only).
   * Useful for the project picker on the Financial Health admin page.
   */
  projectList: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      skip: z.number().int().min(0).default(0),
      take: z.number().int().min(1).max(100).default(25),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (!hasPerm(ctx, 'posting.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });

      const where: Record<string, unknown> = {};
      if (input?.search) {
        where.OR = [
          { name: { contains: input.search, mode: 'insensitive' } },
          { code: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where,
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            _count: {
              select: {
                postingEvents: { where: { status: 'posted' } },
              },
            },
          },
          orderBy: { name: 'asc' },
          skip: input?.skip ?? 0,
          take: input?.take ?? 25,
        }),
        prisma.project.count({ where }),
      ]);

      return {
        projects: projects.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          status: p.status,
          postingEventCount: p._count.postingEvents,
        })),
        total,
      };
    }),
});
