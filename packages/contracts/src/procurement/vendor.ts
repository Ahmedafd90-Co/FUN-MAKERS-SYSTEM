import { z } from 'zod';

export const CreateVendorInputSchema = z.object({
  entityId: z.string().uuid(),
  name: z.string().min(1),
  tradeName: z.string().optional(),
  registrationNumber: z.string().optional(),
  taxId: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  classificationId: z.string().uuid().optional(),
  notes: z.string().optional(),
});
export type CreateVendorInput = z.infer<typeof CreateVendorInputSchema>;

export const UpdateVendorInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  tradeName: z.string().nullable().optional(),
  registrationNumber: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  classificationId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type UpdateVendorInput = z.infer<typeof UpdateVendorInputSchema>;
