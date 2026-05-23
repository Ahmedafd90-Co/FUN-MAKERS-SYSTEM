/**
 * RFQ tRPC sub-router — project-scoped.
 *
 * Phase 5, Task 5.6 — Module 3 Procurement Engine.
 * Permission alignment: H3 hardening patch.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  CreateRfqInputSchema,
  UpdateRfqInputSchema,
  ProcurementListFilterInputSchema,
} from '@fmksa/contracts';
import {
  createRfq,
  updateRfq,
  transitionRfq,
  getRfq,
  listRfqs,
  deleteRfq,
  inviteVendors,
  // PIC-53 — bid evaluation + SLA + award materialisation
  evaluateQuotation,
  getEvaluation,
  listEvaluationsForRfq,
  computeRfqSlaSnapshot,
  materialiseAward,
} from '@fmksa/core';
import { router, projectProcedure } from '../../trpc';
import { mapError, getTransitionPermission, hasPerm } from './_helpers';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const rfqRouter = router({
  list: projectProcedure
    .input(ProcurementListFilterInputSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      return listRfqs(input);
    }),

  get: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getRfq(input.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  create: projectProcedure
    .input(CreateRfqInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.create'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await createRfq(input, ctx.user.id);
      } catch (err) {
        mapError(err);
      }
    }),

  update: projectProcedure
    .input(UpdateRfqInputSchema.extend({ projectId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await updateRfq(input, ctx.user.id, input.projectId);
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
      /** Required for 'award' action — the winning quotation to award. */
      quotationId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const requiredPerm = getTransitionPermission('rfq', input.action);
      if (!hasPerm(ctx, requiredPerm))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await transitionRfq(
          input.id, input.action, ctx.user.id,
          input.comment, input.projectId, input.quotationId,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  delete: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.delete'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        await deleteRfq(input.id, ctx.user.id, input.projectId);
        return { success: true };
      } catch (err) {
        mapError(err);
      }
    }),

  inviteVendors: projectProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      rfqId: z.string().uuid(),
      vendorIds: z.array(z.string().uuid()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.edit'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await inviteVendors(input.rfqId, input.vendorIds, ctx.user.id, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  // ---------------------------------------------------------------------------
  // PIC-53 — Bid evaluation (per-Quotation scoring)
  // ---------------------------------------------------------------------------

  evaluateQuotation: projectProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      quotationId: z.string().uuid(),
      technicalScore: z.number().min(0).max(100),
      commercialScore: z.number().min(0).max(100),
      genericExperienceScore: z.number().min(0).max(100),
      themedEntertainmentExperienceScore: z.number().min(0).max(100),
      creativeAestheticCapabilityScore: z.number().min(0).max(100),
      evaluationNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.evaluate'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await evaluateQuotation(
          {
            quotationId: input.quotationId,
            projectId: input.projectId,
            technicalScore: input.technicalScore,
            commercialScore: input.commercialScore,
            genericExperienceScore: input.genericExperienceScore,
            themedEntertainmentExperienceScore: input.themedEntertainmentExperienceScore,
            creativeAestheticCapabilityScore: input.creativeAestheticCapabilityScore,
            ...(input.evaluationNotes !== undefined ? { evaluationNotes: input.evaluationNotes } : {}),
          },
          ctx.user.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  getEvaluation: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), quotationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await getEvaluation(input.quotationId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  listEvaluations: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), rfqId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await listEvaluationsForRfq(input.rfqId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  // ---------------------------------------------------------------------------
  // PIC-53 — SLA snapshot (read-time computation)
  // ---------------------------------------------------------------------------

  getSlaSnapshot: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), rfqId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await computeRfqSlaSnapshot(input.rfqId, input.projectId);
      } catch (err) {
        mapError(err);
      }
    }),

  // ---------------------------------------------------------------------------
  // PIC-53 — Award materialisation (RFQ → PurchaseOrder OR VendorContract subcontract)
  // ---------------------------------------------------------------------------

  materialiseAward: projectProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      rfqId: z.string().uuid(),
      materialiseAs: z.enum(['po', 'subcontract']),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.materialise'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        return await materialiseAward(
          { rfqId: input.rfqId, projectId: input.projectId, materialiseAs: input.materialiseAs },
          ctx.user.id,
        );
      } catch (err) {
        mapError(err);
      }
    }),

  /**
   * PIC-53 — UI helper for the MaterialiseAwardCard.
   *
   * Returns IDs of any downstream record already materialised from this RFQ
   * (PurchaseOrder OR VendorContract). The card uses this to switch between
   * the explicit-action affordance and a permanent "open the materialised
   * record" link. Both fields are independently nullable: at most one is
   * non-null at a time (idempotent materialisation guard refuses second).
   *
   * Lightweight — only selects `id`. Not folded into `get` because the
   * existing getRfq response shape is consumed by many surfaces and we don't
   * want to broaden its include set just for this card.
   */
  getMaterialisationLink: projectProcedure
    .input(z.object({ projectId: z.string().uuid(), rfqId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.permissions.includes('rfq.view'))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
      try {
        const { prisma } = await import('@fmksa/db');
        const [po, vc] = await Promise.all([
          prisma.purchaseOrder.findFirst({
            where: { rfqId: input.rfqId, projectId: input.projectId },
            select: { id: true },
          }),
          prisma.vendorContract.findFirst({
            where: { rfqId: input.rfqId, projectId: input.projectId },
            select: { id: true },
          }),
        ]);
        return {
          purchaseOrderId: po?.id ?? null,
          vendorContractId: vc?.id ?? null,
        };
      } catch (err) {
        mapError(err);
      }
    }),
});
