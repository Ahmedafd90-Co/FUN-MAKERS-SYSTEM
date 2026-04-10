/**
 * Audit & Override tRPC router — Phase 1.9
 *
 * Procedures:
 *   audit.list           — paginated, filterable audit logs (admin)
 *   audit.get            — single audit entry with full JSON (admin)
 *   audit.overrides      — paginated, filterable override logs (admin)
 *   audit.overrideDetail — single override entry with linked audit log (admin)
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  listAuditLogs,
  getAuditLog,
  listOverrideLogs,
  getOverrideLog,
} from '@fmksa/core';

import { router, adminProcedure } from '../trpc';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const AuditListInputSchema = z.object({
  action: z.string().optional(),
  resourceType: z.string().optional(),
  actorSource: z.string().optional(),
  actorUserId: z.string().optional(),
  projectId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  skip: z.number().int().min(0).optional(),
  take: z.number().int().min(1).max(100).optional(),
});

const OverrideListInputSchema = z.object({
  overrideType: z.string().optional(),
  overriderUserId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  skip: z.number().int().min(0).optional(),
  take: z.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const auditRouter = router({
  list: adminProcedure.input(AuditListInputSchema).query(async ({ input }) => {
    return listAuditLogs(input);
  }),

  get: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const entry = await getAuditLog(input.id);
      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Audit log entry not found.' });
      }
      return entry;
    }),

  overrides: adminProcedure
    .input(OverrideListInputSchema)
    .query(async ({ input }) => {
      return listOverrideLogs(input);
    }),

  overrideDetail: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const entry = await getOverrideLog(input.id);
      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Override log entry not found.' });
      }
      return entry;
    }),
});
