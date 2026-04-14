/**
 * Expense tRPC sub-router — project-scoped CRUD + transitions.
 *
 * Module 3 Procurement Engine — Expense lifecycle.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  createExpense,
  getExpense,
  listExpenses,
  transitionExpense,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';
import { mapError, getTransitionPermission, hasPerm } from './_helpers';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const CreateExpenseInputSchema = z.object({
  projectId: z.string().uuid(),
  subtype: z.enum(['ticket', 'accommodation', 'transportation', 'equipment']),
  title: z.string().min(1),
  description: z.string().optional(),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().min(3).max(3),
  expenseDate: z.string(),
  categoryId: z.string().uuid().optional(),
  receiptReference: z.string().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  // ticket-specific
  ticketType: z.string().optional(),
  travelerName: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  travelDate: z.string().optional(),
  returnDate: z.string().optional(),
  // accommodation-specific
  guestName: z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  hotelName: z.string().optional(),
  expenseCity: z.string().optional(),
  nightlyRate: z.union([z.number(), z.string()]).optional(),
  nights: z.number().optional(),
  // transportation-specific
  vehicleType: z.string().optional(),
  transportOrigin: z.string().optional(),
  transportDestination: z.string().optional(),
  distance: z.union([z.number(), z.string()]).optional(),
  rateType: z.string().optional(),
  // equipment-specific
  equipmentName: z.string().optional(),
  equipmentType: z.string().optional(),
  rentalPeriodFrom: z.string().optional(),
  rentalPeriodTo: z.string().optional(),
  dailyRate: z.union([z.number(), z.string()]).optional(),
  days: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const expenseRouter = router({
  list: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('expense.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listExpenses(input.projectId);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('expense.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getExpense(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateExpenseInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('expense.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createExpense(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  transition: projectProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      id: z.string().uuid(),
      action: z.string(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const requiredPerm = getTransitionPermission('expense', input.action);
      if (!hasPerm(ctx, requiredPerm))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionExpense(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),
});
