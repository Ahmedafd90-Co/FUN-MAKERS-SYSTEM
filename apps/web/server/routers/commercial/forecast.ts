/**
 * IPA Forecast tRPC sub-router.
 *
 * PIC-99 PR-1 (M1) — first sellable surface on the completed MT-spine.
 *
 * Surface (PD ruling 4a70d247):
 *   - list / get / forecastVsActual   → requires 'ipa_forecast.view'
 *   - upsert / delete                 → requires 'ipa_forecast.edit'
 *
 * `get(id)` is the by-id read surface — the CAT4 attack surface (org-A user
 * fetches an org-B forecast by id → must return NOT_FOUND). Service-layer
 * assertProjectScope throws ScopeMismatchError; this router maps that to
 * NOT_FOUND (F3 idiom: no existence disclosure, indistinguishable from
 * not-found / soft-deleted).
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
  getForecast,
  upsertForecast,
  deleteForecast,
  getForecastVsActual,
  ScopeMismatchError,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';

// ---------------------------------------------------------------------------
// Schemas — inline (small surface, no cross-package reuse yet)
// ---------------------------------------------------------------------------

const ListInputSchema = z.object({ projectId: z.string().uuid() });

const GetInputSchema = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid(),
});

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
// Error mapping — F3 NOT_FOUND idiom for ScopeMismatchError + standard remaps
// ---------------------------------------------------------------------------

function mapError(err: unknown): never {
  // ScopeMismatchError → NOT_FOUND (no existence disclosure; same shape as
  // a non-existent or soft-deleted id — F3 idiom from PIC-97 hotfix +
  // PIC-71 PR-2 router pattern in entities/projects/audit/documents).
  if (err instanceof ScopeMismatchError) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
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
    .input(ListInputSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipa_forecast.view')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      }
      return listForecasts(input.projectId);
    }),

  get: projectProcedure
    .input(GetInputSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('ipa_forecast.view')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      }
      try {
        const forecast = await getForecast(input.id, input.projectId);
        if (!forecast) {
          // Includes non-existent + soft-deleted — both NOT_FOUND-shaped per F3.
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        return forecast;
      } catch (err) {
        mapError(err);
      }
    }),

  forecastVsActual: projectProcedure
    .input(ListInputSchema)
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
