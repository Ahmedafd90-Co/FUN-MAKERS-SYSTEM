/**
 * SupplierInvoice tRPC sub-router — project-scoped CRUD + transitions.
 *
 * Module 3 Procurement Engine — Supplier Invoice lifecycle.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  createSupplierInvoice,
  getSupplierInvoice,
  listSupplierInvoices,
  transitionSupplierInvoice,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';
import { mapError, getTransitionPermission, hasPerm } from './_helpers';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const CreateSupplierInvoiceInputSchema = z.object({
  projectId: z.string().uuid(),
  vendorId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional(),
  invoiceDate: z.string(),
  grossAmount: z.union([z.number(), z.string()]),
  vatRate: z.union([z.number(), z.string()]),
  vatAmount: z.union([z.number(), z.string()]),
  totalAmount: z.union([z.number(), z.string()]),
  dueDate: z.string().optional(),
  currency: z.string().min(3).max(3),
  categoryId: z.string().uuid().optional(),
  noPOReason: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const supplierInvoiceRouter = router({
  list: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('supplier_invoice.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listSupplierInvoices(input.projectId);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('supplier_invoice.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getSupplierInvoice(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateSupplierInvoiceInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('supplier_invoice.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createSupplierInvoice(input, ctx.user.id);
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
      const requiredPerm = getTransitionPermission('supplier_invoice', input.action);
      if (!hasPerm(ctx, requiredPerm))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionSupplierInvoice(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),
});
