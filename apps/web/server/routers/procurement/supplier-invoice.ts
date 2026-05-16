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

export const CreateSupplierInvoiceInputSchema = z.object({
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
}).refine(
  // VAT consistency invariant — gross + vatAmount must equal totalAmount
  // within 0.01 (smallest unit for any 2-decimal currency including SAR
  // halala). The form gates this client-side via amountsAreConsistent;
  // this refine ensures non-UI clients (curl, scripts, future mobile,
  // data importers) can't bypass it. Defends against KSA ZATCA reconciliation
  // failures from internally-inconsistent invoice rows.
  (data) => {
    const gross = typeof data.grossAmount === 'number'
      ? data.grossAmount
      : parseFloat(data.grossAmount);
    const vat = typeof data.vatAmount === 'number'
      ? data.vatAmount
      : parseFloat(data.vatAmount);
    const total = typeof data.totalAmount === 'number'
      ? data.totalAmount
      : parseFloat(data.totalAmount);

    // Defer to other validators if any field is missing/non-numeric
    if (isNaN(gross) || isNaN(vat) || isNaN(total)) {
      return true;
    }

    return Math.abs(gross + vat - total) <= 0.01;
  },
  {
    message: 'Amounts do not add up: grossAmount + vatAmount must equal totalAmount (tolerance 0.01).',
    path: ['totalAmount'],
  },
);

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
