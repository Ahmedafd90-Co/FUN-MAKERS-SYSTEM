/**
 * IPA Forecast tRPC sub-router.
 *
 * Narrow, explicit surface:
 *   - list / forecastVsActual      → requires 'ipa_forecast.view'
 *   - upsert / delete              → requires 'ipa_forecast.edit'
 *
 * The dashboard's forecast KPIs render via `commercial.dashboard.financialKpis`
 * (gated by 'commercial_dashboard.view'), so dashboard visibility does not
 * depend on the narrower 'ipa_forecast.view' permission. That permission
 * controls access to per-row forecast data (admin page) and the per-period
 * rollup used by the IPA register strip.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  listForecasts,
  upsertForecast,
  deleteForecast,
  getForecastVsActual,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';

// ---------------------------------------------------------------------------
// Schemas — kept inline (small surface, no cross-package reuse yet)
// ---------------------------------------------------------------------------

const UpsertForecastSchema = z.object({
  projectId: z.string().uuid(),
  periodNumber: z.number().int().positive(),
  periodStart: z.string().datetime(),
  forecastAmount: z.number().nonnegative(),
  currency: z.string().min(1),
  notes: z.string().max(500).nullable().optional(),
});

const DeleteForecastSchema = z.object({
  projectId: z.string().uuid(),
  periodNumber: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Error mapping — mirrors ipa.ts
// ---------------------------------------------------------------------------

function mapError(err: unknown): never {
  if (err instanceof Error) {
    if (err.message.toLowerCase().includes('not found')) {
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
    }
    if (err.message.startsWith('Invalid') || err.message.startsWith('Cannot')) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
    }
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const forecastRouter = router({
  list: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipa_forecast.view')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      }
      return listForecasts(input.projectId);
    }),

  forecastVsActual: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipa_forecast.view')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      }
      return getForecastVsActual(input.projectId);
    }),

  upsert: projectProcedure
    .input(UpsertForecastSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipa_forecast.edit')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      }
      try {
        return await upsertForecast(
          {
            projectId: input.projectId,
            periodNumber: input.periodNumber,
            periodStart: new Date(input.periodStart),
            forecastAmount: input.forecastAmount,
            currency: input.currency,
            notes: input.notes ?? null,
          },
          ctx.user.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  delete: projectProcedure
    .input(DeleteForecastSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipa_forecast.edit')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      }
      try {
        await deleteForecast(input.projectId, input.periodNumber, ctx.user.id);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),
});
