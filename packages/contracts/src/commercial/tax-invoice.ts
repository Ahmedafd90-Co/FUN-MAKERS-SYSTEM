import { z } from 'zod';

export const CreateTaxInvoiceInputSchema = z.object({
  projectId: z.string().uuid(),
  ipcId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().datetime(),
  grossAmount: z.number(),
  vatRate: z.number().min(0).max(1),
  vatAmount: z.number(),
  totalAmount: z.number(),
  dueDate: z.string().datetime().optional(),
  currency: z.string().min(1),
  buyerName: z.string().min(1),
  buyerTaxId: z.string().optional(),
  sellerTaxId: z.string().min(1),
});
export type CreateTaxInvoiceInput = z.infer<typeof CreateTaxInvoiceInputSchema>;

export const UpdateTaxInvoiceInputSchema = z.object({
  id: z.string().uuid(),
  invoiceDate: z.string().datetime().optional(),
  grossAmount: z.number().optional(),
  vatRate: z.number().min(0).max(1).optional(),
  vatAmount: z.number().optional(),
  totalAmount: z.number().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  currency: z.string().min(1).optional(),
  buyerName: z.string().min(1).optional(),
  buyerTaxId: z.string().nullable().optional(),
  sellerTaxId: z.string().min(1).optional(),
});
export type UpdateTaxInvoiceInput = z.infer<typeof UpdateTaxInvoiceInputSchema>;
