/**
 * RFQ Award materialisation — PIC-53 (Layer 2.5 PR-4).
 *
 * Separates two concerns:
 *
 *   - The "award" action (existing, in transitionRfq) — decides the winner;
 *     atomically marks the winning quotation status='awarded', rejects sibling
 *     quotations, sets RFQ.status='awarded'.
 *
 *   - "materialiseAward" (NEW, this service) — creates the downstream
 *     PurchaseOrder OR VendorContract (contractType='subcontract') from
 *     the awarded RFQ. Idempotent: refuses to materialise twice for the same
 *     RFQ (queries existing PO/VC with `rfqId === this RFQ`).
 *
 * UX visibility (acknowledgment requirement): the "materialise this award"
 * action is explicit — there is NO auto-materialisation on award. This is
 * deliberate so that the user explicitly chooses PO vs Subcontract per the
 * deal shape. The UI surfaces a clearly visible "Materialise as…" affordance
 * on awarded RFQs (Commit 5); reviewers expecting auto-materialisation
 * should know the design is explicit-action by intent.
 *
 * All status writes inside `runAsWorkflowEngine` (PIC-47 lesson): both
 * PurchaseOrder and VendorContract are in WORKFLOW_DRIVEN_MODELS, so any
 * status write outside the engine scope is structurally rejected.
 *
 * No hardcoded business values (PIC-41): the new records' totalAmount /
 * totalValue / currency / vendorId all come from the awarded Quotation.
 * Defaults that are placeholder values (e.g. VendorContract startDate =
 * now(), endDate = +1y) are documented as "user must edit before submit"
 * — they are draft placeholders, not policy.
 */

import { prisma, runAsWorkflowEngine } from '@fmksa/db';
import { auditService } from '../../audit/service';
import { resolveProjectOrgId } from '../../org-resolution';
import { assertProjectScope } from '../../scope-binding';
import { generateReferenceNumber, generateOrgScopedNumber } from '../../commercial/reference-number/service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MaterialiseAs = 'po' | 'subcontract';

export type MaterialiseAwardInput = {
  rfqId: string;
  projectId: string;
  materialiseAs: MaterialiseAs;
};

export type MaterialiseAwardResult = {
  materialiseAs: MaterialiseAs;
  /** ID of the newly created PurchaseOrder OR VendorContract. */
  recordId: string;
  /** Convenience: the "type" of the newly created entity for UI routing. */
  recordType: 'purchase_order' | 'vendor_contract';
  /** The id of the awarded Quotation from which fields were derived. */
  sourceQuotationId: string;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class RfqNotAwardedError extends Error {
  constructor(rfqId: string, status: string) {
    super(
      `Cannot materialise award for RFQ ${rfqId}: status is '${status}', expected 'awarded'. ` +
        `Run the award action first (selects a winning quotation).`,
    );
    this.name = 'RfqNotAwardedError';
  }
}

export class RfqAlreadyMaterialisedError extends Error {
  constructor(rfqId: string, existingType: 'purchase_order' | 'vendor_contract', existingId: string) {
    super(
      `RFQ ${rfqId} has already been materialised as ${existingType} ${existingId}. ` +
        `materialiseAward is idempotent — refuses to create a second downstream record. ` +
        `If the existing record is wrong, the operator should cancel it first via its own workflow.`,
    );
    this.name = 'RfqAlreadyMaterialisedError';
  }
}

export class NoAwardedQuotationError extends Error {
  constructor(rfqId: string) {
    super(
      `RFQ ${rfqId} is in status='awarded' but no Quotation with status='awarded' was found. ` +
        `Data integrity issue — investigate audit log for the rfq.transition.award entry.`,
    );
    this.name = 'NoAwardedQuotationError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** VendorContract draft defaults — placeholder dates the user MUST edit before submit. */
const DRAFT_CONTRACT_LIFETIME_DAYS = 365;

function defaultEndDate(start: Date): Date {
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + DRAFT_CONTRACT_LIFETIME_DAYS);
  return end;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Materialise the awarded RFQ as a PurchaseOrder OR a VendorContract
 * (contractType='subcontract'). Idempotent — refuses if either downstream
 * record already exists with `rfqId === this RFQ`.
 *
 * Returns the newly created record's id + type.
 */
export async function materialiseAward(
  input: MaterialiseAwardInput,
  actorUserId: string,
): Promise<MaterialiseAwardResult> {
  // PIC-47: all status writes engine-scoped (PurchaseOrder + VendorContract
  // are both in WORKFLOW_DRIVEN_MODELS; the create-with-status='draft' would
  // be allowed by the extension regardless, but we wrap from outside to keep
  // the engine-scoping invariant intact if either service later evolves to
  // write status during create).
  return runAsWorkflowEngine(async () => {
    // 1. Load RFQ + verify scope + verify status.
    const rfq = await prisma.rFQ.findUniqueOrThrow({ where: { id: input.rfqId } });
    assertProjectScope(rfq, input.projectId, 'RFQ', input.rfqId);
    if (rfq.status !== 'awarded') {
      throw new RfqNotAwardedError(input.rfqId, rfq.status);
    }

    // 2. Idempotency check: is there already a PO or VC for this RFQ?
    const [existingPo, existingVc] = await Promise.all([
      prisma.purchaseOrder.findFirst({
        where: { rfqId: input.rfqId },
        select: { id: true },
      }),
      prisma.vendorContract.findFirst({
        where: { rfqId: input.rfqId },
        select: { id: true },
      }),
    ]);
    if (existingPo) {
      throw new RfqAlreadyMaterialisedError(input.rfqId, 'purchase_order', existingPo.id);
    }
    if (existingVc) {
      throw new RfqAlreadyMaterialisedError(input.rfqId, 'vendor_contract', existingVc.id);
    }

    // 3. Find the awarded Quotation (source of vendor / amount / currency).
    //    Prefer the first-class FK if populated; fall back to status query.
    //    Both lookups use findFirst (with include) so TypeScript narrows the
    //    `lineItems` field consistently.
    const awardedQuotation = rfq.awardedQuotationId
      ? await prisma.quotation.findFirst({
          where: { id: rfq.awardedQuotationId },
          include: { lineItems: true },
        })
      : await prisma.quotation.findFirst({
          where: { rfqId: input.rfqId, status: 'awarded' },
          include: { lineItems: true },
        });
    if (!awardedQuotation) {
      throw new NoAwardedQuotationError(input.rfqId);
    }

    // 4. Materialise.
    if (input.materialiseAs === 'po') {
      const created = await prisma.$transaction(async (tx) => {
        const poNumber = await generateReferenceNumber(input.projectId, 'PO', tx);
        const orgId = await resolveProjectOrgId(input.projectId, tx);
        return (tx as typeof prisma).purchaseOrder.create({
          data: {
            orgId,
            projectId: input.projectId,
            vendorId: awardedQuotation!.vendorId,
            rfqId: input.rfqId,
            quotationId: awardedQuotation!.id,
            poNumber,
            title: rfq.title,
            description: rfq.description ?? null,
            totalAmount: awardedQuotation!.totalAmount,
            currency: awardedQuotation!.currency,
            paymentTerms: awardedQuotation!.paymentTerms ?? null,
            status: 'draft',
            createdBy: actorUserId,
            items: {
              create: awardedQuotation!.lineItems.map((li) => ({
                itemCatalogId: li.itemCatalogId ?? null,
                itemDescription: li.itemDescription,
                quantity: li.quantity,
                unit: li.unit,
                unitPrice: li.unitPrice,
                totalPrice: li.totalPrice,
              })),
            },
          },
        });
      });

      await auditService.log({
        actorUserId,
        actorSource: 'user',
        action: 'rfq.materialise_award.purchase_order',
        resourceType: 'rfq',
        resourceId: input.rfqId,
        projectId: input.projectId,
        beforeJson: null,
        afterJson: {
          materialisedAs: 'po',
          purchaseOrderId: created.id,
          sourceQuotationId: awardedQuotation.id,
        },
      });

      return {
        materialiseAs: 'po' as const,
        recordId: created.id,
        recordType: 'purchase_order' as const,
        sourceQuotationId: awardedQuotation.id,
      };
    }

    // Subcontract path — creates a draft VendorContract with contractType='subcontract'.
    // Date placeholders: startDate = now(); endDate = +365 days. The user MUST
    // edit these before submitting the draft for approval — they are NOT
    // policy values, just convenient initialisation so the draft schema is
    // valid (both fields are NOT NULL on VendorContract).
    const startDate = new Date();
    const endDate = defaultEndDate(startDate);
    const created = await prisma.$transaction(async (tx) => {
      // PIC-84: VendorContract is project-scoped — derive orgId from the project + atomic counter.
      const project = await (tx as typeof prisma).project.findUniqueOrThrow({
        where: { id: input.projectId },
        select: { orgId: true },
      });
      const contractNumber = await generateOrgScopedNumber(
        project.orgId,
        'VC',
        (n: number) => `VC-${String(n).padStart(4, '0')}`,
        tx,
      );
      return (tx as typeof prisma).vendorContract.create({
        data: {
          orgId: project.orgId,
          projectId: input.projectId,
          vendorId: awardedQuotation!.vendorId,
          rfqId: input.rfqId,
          contractNumber,
          title: rfq.title,
          description: rfq.description ?? null,
          contractType: 'subcontract',
          startDate,
          endDate,
          totalValue: awardedQuotation!.totalAmount,
          currency: awardedQuotation!.currency,
          terms: awardedQuotation!.paymentTerms ?? null,
          status: 'draft',
          createdBy: actorUserId,
        },
      });
    });

    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: 'rfq.materialise_award.subcontract',
      resourceType: 'rfq',
      resourceId: input.rfqId,
      projectId: input.projectId,
      beforeJson: null,
      afterJson: {
        materialisedAs: 'subcontract',
        vendorContractId: created.id,
        sourceQuotationId: awardedQuotation.id,
      },
    });

    return {
      materialiseAs: 'subcontract' as const,
      recordId: created.id,
      recordType: 'vendor_contract' as const,
      sourceQuotationId: awardedQuotation.id,
    };
  });
}
