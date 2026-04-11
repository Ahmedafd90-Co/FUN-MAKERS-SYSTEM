import { z } from 'zod';

export const CreateSupplierInvoiceInputSchema = z.object({
  projectId: z.string().uuid(),
  vendorId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional(),
  invoiceDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  currency: z.string().min(1),
  grossAmount: z.number().positive(),
  vatRate: z.number().min(0).max(1),
  vatAmount: z.number(),
  totalAmount: z.number().positive(),
  description: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    purchaseOrderItemId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    totalPrice: z.number().positive(),
    notes: z.string().optional(),
  })).optional(),
});
export type CreateSupplierInvoiceInput = z.infer<typeof CreateSupplierInvoiceInputSchema>;

export const UpdateSupplierInvoiceInputSchema = z.object({
  id: z.string().uuid(),
  invoiceDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  currency: z.string().min(1).optional(),
  grossAmount: z.number().positive().optional(),
  vatRate: z.number().min(0).max(1).optional(),
  vatAmount: z.number().optional(),
  totalAmount: z.number().positive().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(z.object({
    purchaseOrderItemId: z.string().uuid().optional(),
    itemDescription: z.string().min(1),
    unit: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    totalPrice: z.number().positive(),
    notes: z.string().optional(),
  })).optional(),
});
export type UpdateSupplierInvoiceInput = z.infer<typeof UpdateSupplierInvoiceInputSchema>;
