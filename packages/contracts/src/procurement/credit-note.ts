import { z } from 'zod';

export const CreateCreditNoteInputSchema = z.object({
  projectId: z.string().uuid(),
  subtype: z.enum(['credit_note', 'rebate', 'recovery']),
  vendorId: z.string().uuid(),
  supplierInvoiceId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  correspondenceId: z.string().uuid().optional(),
  amount: z.number().positive(),
  currency: z.string().min(1),
  description: z.string().optional(),
});
export type CreateCreditNoteInput = z.infer<typeof CreateCreditNoteInputSchema>;

export const UpdateCreditNoteInputSchema = z.object({
  id: z.string().uuid(),
  subtype: z.enum(['credit_note', 'rebate', 'recovery']).optional(),
  vendorId: z.string().uuid().optional(),
  supplierInvoiceId: z.string().uuid().nullable().optional(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  correspondenceId: z.string().uuid().nullable().optional(),
  amount: z.number().positive().optional(),
  currency: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});
export type UpdateCreditNoteInput = z.infer<typeof UpdateCreditNoteInputSchema>;
