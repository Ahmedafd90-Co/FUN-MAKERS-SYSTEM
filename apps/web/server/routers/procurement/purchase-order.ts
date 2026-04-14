/**
 * PurchaseOrder tRPC sub-router — project-scoped CRUD + transitions.
 *
 * Module 3 Procurement Engine — Purchase Order lifecycle.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  transitionPurchaseOrder,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';
import { mapError, getTransitionPermission, hasPerm } from './_helpers';

// ---------------------------------------------------------------------------
// Input schemas (inline — no shared contracts package dependency needed yet)
// ---------------------------------------------------------------------------

const CreatePurchaseOrderInputSchema = z.object({
  projectId: z.string().uuid(),
  vendorId: z.string().uuid(),
  rfqId: z.string().uuid().optional(),
  quotationId: z.string().uuid().optional(),
  vendorContractId: z.string().uuid().optional(),
  frameworkAgreementId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  totalAmount: z.union([z.number(), z.string()]),
  currency: z.string().min(3).max(3),
  deliveryDate: z.string().optional(),
  deliveryAddress: z.string().optional(),
  paymentTerms: z.string().optional(),
  items: z.array(z.object({
    itemCatalogId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    quantity: z.union([z.number(), z.string()]),
    unit: z.string().min(1),
    unitPrice: z.union([z.number(), z.string()]),
    totalPrice: z.union([z.number(), z.string()]),
  })).optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const purchaseOrderRouter = router({
  list: projectProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('purchase_order.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listPurchaseOrders(input.projectId);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('purchase_order.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getPurchaseOrder(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreatePurchaseOrderInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('purchase_order.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createPurchaseOrder(input, ctx.user.id);
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
      const requiredPerm = getTransitionPermission('purchase_order', input.action);
      if (!hasPerm(ctx, requiredPerm))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionPurchaseOrder(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),
});
