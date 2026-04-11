import { z } from 'zod';

export const CreateExpenseInputSchema = z.object({
  projectId: z.string().uuid(),
  subtype: z.enum(['ticket', 'accommodation', 'transportation', 'equipment', 'general']),
  amount: z.number().positive(),
  currency: z.string().min(1),
  categoryId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  description: z.string().optional(),
  // Subtype-specific fields (all optional — validated by service layer based on subtype)
  ticketType: z.enum(['flight', 'event', 'other']).optional(),
  ticketPassengerName: z.string().optional(),
  ticketRoute: z.string().optional(),
  ticketDate: z.string().datetime().optional(),
  accommodationLocation: z.string().optional(),
  accommodationCheckIn: z.string().datetime().optional(),
  accommodationCheckOut: z.string().datetime().optional(),
  accommodationNights: z.number().int().positive().optional(),
  accommodationDailyRate: z.number().positive().optional(),
  transportType: z.string().optional(),
  transportRateType: z.enum(['per_trip', 'per_day', 'per_km']).optional(),
  transportRate: z.number().positive().optional(),
  transportDistance: z.number().positive().optional(),
  equipmentName: z.string().optional(),
  equipmentSerialNumber: z.string().optional(),
  equipmentRentalPeriod: z.string().optional(),
});
export type CreateExpenseInput = z.infer<typeof CreateExpenseInputSchema>;

export const UpdateExpenseInputSchema = z.object({
  id: z.string().uuid(),
  subtype: z.enum(['ticket', 'accommodation', 'transportation', 'equipment', 'general']).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().min(1).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  // Subtype-specific fields
  ticketType: z.enum(['flight', 'event', 'other']).nullable().optional(),
  ticketPassengerName: z.string().nullable().optional(),
  ticketRoute: z.string().nullable().optional(),
  ticketDate: z.string().datetime().nullable().optional(),
  accommodationLocation: z.string().nullable().optional(),
  accommodationCheckIn: z.string().datetime().nullable().optional(),
  accommodationCheckOut: z.string().datetime().nullable().optional(),
  accommodationNights: z.number().int().positive().nullable().optional(),
  accommodationDailyRate: z.number().positive().nullable().optional(),
  transportType: z.string().nullable().optional(),
  transportRateType: z.enum(['per_trip', 'per_day', 'per_km']).nullable().optional(),
  transportRate: z.number().positive().nullable().optional(),
  transportDistance: z.number().positive().nullable().optional(),
  equipmentName: z.string().nullable().optional(),
  equipmentSerialNumber: z.string().nullable().optional(),
  equipmentRentalPeriod: z.string().nullable().optional(),
});
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseInputSchema>;
