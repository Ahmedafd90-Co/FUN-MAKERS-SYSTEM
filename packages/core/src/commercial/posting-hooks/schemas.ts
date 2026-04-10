import { z } from 'zod';

export const IPA_APPROVED_SCHEMA = z.object({
  ipaId: z.string(),
  periodNumber: z.number().int(),
  grossAmount: z.string(),
  retentionAmount: z.string(),
  netClaimed: z.string(),
  currency: z.string(),
  projectId: z.string(),
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
