import { z } from 'zod';

export const CreateCatalogItemInputSchema = z.object({
  entityId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  unit: z.string().min(1),
  // --- Planned for a future schema migration (not yet in Prisma ItemCatalog model) ---
  // sku: z.string().optional(),
  // estimatedUnitPrice: z.number().positive().optional(),
  // currency: z.string().min(1).optional(),
  // leadTimeDays: z.number().int().positive().optional(),
  // preferredVendorId: z.string().uuid().optional(),
  // notes: z.string().optional(),
});
export type CreateCatalogItemInput = z.infer<typeof CreateCatalogItemInputSchema>;

export const UpdateCatalogItemInputSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  unit: z.string().min(1).optional(),
  // --- Planned for a future schema migration (not yet in Prisma ItemCatalog model) ---
  // sku: z.string().nullable().optional(),
  // estimatedUnitPrice: z.number().positive().nullable().optional(),
  // currency: z.string().min(1).nullable().optional(),
  // leadTimeDays: z.number().int().positive().nullable().optional(),
  // preferredVendorId: z.string().uuid().nullable().optional(),
  // notes: z.string().nullable().optional(),
});
export type UpdateCatalogItemInput = z.infer<typeof UpdateCatalogItemInputSchema>;
