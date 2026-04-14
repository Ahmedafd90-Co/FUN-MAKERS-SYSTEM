import { z } from 'zod';

// ---------------------------------------------------------------------------
// Transition Schemas — one per model family
// ---------------------------------------------------------------------------

const baseTransition = {
  id: z.string().uuid(),
  comment: z.string().optional(),
  projectId: z.string().uuid(),
};

const COMMON_ACTIONS = ['submit', 'approve', 'reject', 'return', 'sign', 'issue', 'close', 'supersede'] as const;

export const IpaTransitionSchema = z.object({
  ...baseTransition,
  action: z.enum([...COMMON_ACTIONS]),
});
export type IpaTransitionInput = z.infer<typeof IpaTransitionSchema>;

// IPC uses same actions as IPA
export const IpcTransitionSchema = IpaTransitionSchema;
export type IpcTransitionInput = z.infer<typeof IpcTransitionSchema>;

export const VariationTransitionSchema = z.object({
  ...baseTransition,
  action: z.enum([...COMMON_ACTIONS, 'client_pending', 'client_approved', 'client_rejected']),
});
export type VariationTransitionInput = z.infer<typeof VariationTransitionSchema>;

export const CostProposalTransitionSchema = z.object({
  ...baseTransition,
  action: z.enum([...COMMON_ACTIONS, 'link_to_variation']),
});
export type CostProposalTransitionInput = z.infer<typeof CostProposalTransitionSchema>;

export const TaxInvoiceTransitionSchema = z.object({
  ...baseTransition,
  action: z.enum([...COMMON_ACTIONS, 'mark_submitted', 'mark_partially_collected', 'mark_collected', 'mark_overdue', 'mark_cancelled']),
});
export type TaxInvoiceTransitionInput = z.infer<typeof TaxInvoiceTransitionSchema>;

export const CorrespondenceTransitionSchema = z.object({
  ...baseTransition,
  action: z.enum([
    ...COMMON_ACTIONS,
    'mark_response_due', 'mark_responded',
    'mark_under_evaluation', 'mark_partially_accepted', 'mark_accepted', 'mark_disputed',
    'mark_acknowledged', 'mark_recovered', 'mark_partially_recovered',
  ]),
});
export type CorrespondenceTransitionInput = z.infer<typeof CorrespondenceTransitionSchema>;

// ---------------------------------------------------------------------------
// List Filter Schema (Addendum A) — reusable for all list procedures
// ---------------------------------------------------------------------------

export const ListFilterInputSchema = z.object({
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
});
export type ListFilterInput = z.infer<typeof ListFilterInputSchema>;

/**
 * Tax-invoice-specific list input — extends the shared schema with a
 * dueDate-based overdue filter for KPI drilldown fidelity.
 */
export const TaxInvoiceListInputSchema = ListFilterInputSchema.extend({
  overdueOnly: z.boolean().optional(),
});
export type TaxInvoiceListInput = z.infer<typeof TaxInvoiceListInputSchema>;
