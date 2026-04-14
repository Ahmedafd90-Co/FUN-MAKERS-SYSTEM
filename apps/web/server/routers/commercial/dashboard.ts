/**
 * Commercial Dashboard tRPC sub-router.
 *
 * Task 18: Commercial tRPC Router — Module 2 Commercial Engine.
 * Phase E: Financial KPI service procedure added.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  getCommercialDashboard,
  getFinancialKpis,
  registerCommercialEventTypes,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';

// Register commercial event types at module load
registerCommercialEventTypes();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const commercialDashboardRouter = router({
  summary: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('commercial_dashboard.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      return getCommercialDashboard(input.projectId);
    }),

  financialKpis: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('commercial_dashboard.view'))
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions.',
        });
      return getFinancialKpis(input.projectId);
    }),
});
