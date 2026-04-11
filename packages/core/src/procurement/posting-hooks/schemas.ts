import { z } from 'zod';

export const PO_ISSUED_SCHEMA = z.object({
  purchaseOrderId: z.string().uuid(),
  poNumber: z.string(),
  vendorId: z.string().uuid(),
  totalAmount: z.string(),
  currency: z.string(),
  categoryId: z.string().uuid().nullable(),
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});

export const PO_DELIVERED_SCHEMA = z.object({
  purchaseOrderId: z.string().uuid(),
  poNumber: z.string(),
  vendorId: z.string().uuid(),
  totalAmount: z.string(),
  deliveredAmount: z.string(),
  currency: z.string(),
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});

export const SUPPLIER_INVOICE_APPROVED_SCHEMA = z.object({
  supplierInvoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  vendorId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().nullable(),
  grossAmount: z.string(),
  vatAmount: z.string(),
  totalAmount: z.string(),
  currency: z.string(),
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});

export const EXPENSE_APPROVED_SCHEMA = z.object({
  expenseId: z.string().uuid(),
  subtype: z.enum(['ticket', 'accommodation', 'transportation', 'equipment', 'general']),
  amount: z.string(),
  currency: z.string(),
  categoryId: z.string().uuid().nullable(),
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});

export const CREDIT_NOTE_APPLIED_SCHEMA = z.object({
  creditNoteId: z.string().uuid(),
  subtype: z.enum(['credit_note', 'rebate', 'recovery']),
  vendorId: z.string().uuid(),
  supplierInvoiceId: z.string().uuid().nullable(),
  purchaseOrderId: z.string().uuid().nullable(),
  amount: z.string(),
  currency: z.string(),
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});

export const VENDOR_CONTRACT_SIGNED_SCHEMA = z.object({
  vendorContractId: z.string().uuid(),
  contractNumber: z.string(),
  vendorId: z.string().uuid(),
  totalValue: z.string(),
  currency: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  projectId: z.string().uuid(),
  entityId: z.string().uuid(),
});

export const FRAMEWORK_AGREEMENT_ACTIVE_SCHEMA = z.object({
  frameworkAgreementId: z.string().uuid(),
  agreementNumber: z.string(),
  vendorId: z.string().uuid(),
  totalCommittedValue: z.string().nullable(),
  currency: z.string(),
  validFrom: z.string(),
  validTo: z.string(),
  projectId: z.string().uuid().nullable(),
  entityId: z.string().uuid(),
});
