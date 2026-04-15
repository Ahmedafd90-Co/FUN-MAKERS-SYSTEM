import { z } from 'zod';

export const IPA_APPROVED_SCHEMA = z.object({
  ipaId: z.string(),
  periodNumber: z.number().int(),
  grossAmount: z.string(),
  retentionAmount: z.string(),
  netClaimed: z.string(),
  currency: z.string(),
  projectId: z.string(),
  /**
   * Present only when the event was emitted by the sheet-import pipeline.
   * Live events never carry this block. Keeps import provenance on the
   * posting record even if the surrounding Ipa row is later altered.
   */
  _import: z
    .object({
      batchId: z.string().optional(),
      rowId: z.string().optional(),
      rowNumber: z.number().optional(),
      /** 'approvedAt' | 'signedAt' | 'issuedAt' | 'periodTo' */
      postingDateSource: z.string().optional(),
    })
    .optional(),
});

export const IPC_SIGNED_SCHEMA = z.object({
  ipcId: z.string(),
  ipaId: z.string(),
  certifiedAmount: z.string(),
  retentionAmount: z.string(),
  netCertified: z.string(),
  currency: z.string(),
  projectId: z.string(),
});

export const VARIATION_APPROVED_INTERNAL_SCHEMA = z.object({
  variationId: z.string(),
  subtype: z.string(),
  title: z.string(),
  costImpact: z.string().nullable(),
  /** The approved cost impact — may differ from costImpact (the claim). */
  approvedCostImpact: z.string().nullable(),
  timeImpactDays: z.number().int().nullable(),
  currency: z.string(),
  projectId: z.string(),
});

export const VARIATION_APPROVED_CLIENT_SCHEMA = z.object({
  variationId: z.string(),
  subtype: z.string(),
  approvedCost: z.string().nullable(),
  approvedTimeDays: z.number().int().nullable(),
  clientRef: z.string().optional(),
  currency: z.string(),
  projectId: z.string(),
});

export const TAX_INVOICE_ISSUED_SCHEMA = z.object({
  taxInvoiceId: z.string(),
  ipcId: z.string(),
  invoiceNumber: z.string(),
  grossAmount: z.string(),
  vatRate: z.string(),
  vatAmount: z.string(),
  totalAmount: z.string(),
  currency: z.string(),
  projectId: z.string(),
});

export const CLAIM_ISSUED_SCHEMA = z.object({
  correspondenceId: z.string(),
  claimType: z.string(),
  claimedAmount: z.string(),
  claimedTimeDays: z.number().int().nullable(),
  currency: z.string(),
  projectId: z.string(),
});

export const BACK_CHARGE_ISSUED_SCHEMA = z.object({
  correspondenceId: z.string(),
  targetName: z.string(),
  category: z.string(),
  chargedAmount: z.string(),
  currency: z.string(),
  projectId: z.string(),
});

/**
 * Post-commit corrections to an IPA record. Paired with IpaAdjustmentBatch
 * rows in the DB — this posting event is the signed accounting side of
 * that header.
 *
 * adjustmentType values:
 *   - imported_correction       — fixing an imported_historical record
 *   - manual_correction         — generic manual fix on a live record
 *   - period_recategorization   — shifting amounts across periods
 *
 * Amount fields are DELTAS, not absolute values. Reconciliation aggregates
 * these against the matching base event (IPA_APPROVED) to arrive at the
 * revised total.
 */
export const IPA_ADJUSTMENT_SCHEMA = z.object({
  ipaAdjustmentBatchId: z.string(),
  ipaId: z.string(),
  adjustmentType: z.string(),
  reason: z.string(),
  grossAmountDelta: z.string(),
  retentionAmountDelta: z.string(),
  netClaimedDelta: z.string(),
  currency: z.string(),
  projectId: z.string(),
  _import: z
    .object({
      batchId: z.string().optional(),
      rowId: z.string().optional(),
      rowNumber: z.number().optional(),
      postingDateSource: z.string().optional(),
    })
    .optional(),
});
