import { z } from 'zod';

// ---------------------------------------------------------------------------
// Transition Schemas — one per model family
// ---------------------------------------------------------------------------

const baseProjectTransition = {
  id: z.string().uuid(),
  comment: z.string().optional(),
  projectId: z.string().uuid(),
};

const baseEntityTransition = {
  id: z.string().uuid(),
  comment: z.string().optional(),
  entityId: z.string().uuid(),
};

const PROCUREMENT_ACTIONS = [
  'submit', 'approve', 'reject', 'return', 'sign', 'issue',
  'terminate', 'evaluate', 'award', 'shortlist',
  'prepare_payment', 'verify', 'apply', 'activate', 'suspend', 'blacklist',
] as const;

// -- Project-scoped transitions --

export const PurchaseOrderTransitionSchema = z.object({
  ...baseProjectTransition,
  action: z.enum([...PROCUREMENT_ACTIONS]),
});
export type PurchaseOrderTransitionInput = z.infer<typeof PurchaseOrderTransitionSchema>;

export const SupplierInvoiceTransitionSchema = z.object({
  ...baseProjectTransition,
  action: z.enum([...PROCUREMENT_ACTIONS]),
});
export type SupplierInvoiceTransitionInput = z.infer<typeof SupplierInvoiceTransitionSchema>;

export const ExpenseTransitionSchema = z.object({
  ...baseProjectTransition,
  action: z.enum([...PROCUREMENT_ACTIONS]),
});
export type ExpenseTransitionInput = z.infer<typeof ExpenseTransitionSchema>;

export const CreditNoteTransitionSchema = z.object({
  ...baseProjectTransition,
  action: z.enum([...PROCUREMENT_ACTIONS]),
});
export type CreditNoteTransitionInput = z.infer<typeof CreditNoteTransitionSchema>;

export const RfqTransitionSchema = z.object({
  ...baseProjectTransition,
  action: z.enum([...PROCUREMENT_ACTIONS]),
});
export type RfqTransitionInput = z.infer<typeof RfqTransitionSchema>;

export const QuotationTransitionSchema = z.object({
  ...baseProjectTransition,
  action: z.enum([...PROCUREMENT_ACTIONS]),
});
export type QuotationTransitionInput = z.infer<typeof QuotationTransitionSchema>;

// -- Entity-scoped transitions --

export const VendorTransitionSchema = z.object({
  ...baseEntityTransition,
  action: z.enum([...PROCUREMENT_ACTIONS]),
});
export type VendorTransitionInput = z.infer<typeof VendorTransitionSchema>;

export const VendorContractTransitionSchema = z.object({
  ...baseProjectTransition,
  action: z.enum([...PROCUREMENT_ACTIONS]),
});
export type VendorContractTransitionInput = z.infer<typeof VendorContractTransitionSchema>;

export const FrameworkAgreementTransitionSchema = z.object({
  ...baseEntityTransition,
  action: z.enum([...PROCUREMENT_ACTIONS]),
});
export type FrameworkAgreementTransitionInput = z.infer<typeof FrameworkAgreementTransitionSchema>;

// ---------------------------------------------------------------------------
// List Filter Schemas
// ---------------------------------------------------------------------------

/**
 * Project-scoped list filter — extends M2 pattern with vendor/category filters.
 */
export const ProcurementListFilterInputSchema = z.object({
  projectId: z.string().uuid(),
  skip: z.number().int().min(0).default(0),
  take: z.number().int().min(1).max(100).default(20),
  sortField: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  statusFilter: z.array(z.string()).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  amountMin: z.number().optional(),
  amountMax: z.number().optional(),
  createdByFilter: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});
export type ProcurementListFilterInput = z.infer<typeof ProcurementListFilterInputSchema>;

/**
 * Entity-scoped list filter — uses entityId instead of projectId.
 */
export const EntityListFilterInputSchema = z.object({
  entityId: z.string().uuid(),
  skip: z.number().int().min(0).default(0),
  take: z.number().int().min(1).max(100).default(20),
  sortField: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  statusFilter: z.array(z.string()).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  createdByFilter: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});
export type EntityListFilterInput = z.infer<typeof EntityListFilterInputSchema>;
