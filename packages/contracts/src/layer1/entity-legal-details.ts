import { z } from 'zod';

// 1:1 sidecar to Entity for legal/commercial fields. Upsert-only operation:
// the row is created on first save and updated on subsequent saves. All fields
// except entityId are nullable — operations may save partial details.
//
// PIC-20: updatedBy intentionally absent. The router injects ctx.user.id when
// calling the service so client code cannot impersonate another user as the
// record's editor.
//
// IBAN/SWIFT are stored as basic strings in Phase 1; full IBAN check digit
// validation is deferred to Phase 4 polish per PIC-8.
export const UpsertEntityLegalDetailsInputSchema = z.object({
  entityId: z.string().uuid(),
  taxId: z.string().nullish(),
  registrationNumber: z.string().nullish(),
  jurisdiction: z.string().nullish(),
  registeredAddress: z.string().nullish(),
  contactName: z.string().nullish(),
  contactEmail: z.string().email().nullish(),
  contactPhone: z.string().nullish(),
  bankName: z.string().nullish(),
  bankAccountNumber: z.string().nullish(),
  bankIban: z.string().nullish(),
  bankSwift: z.string().nullish(),
  notes: z.string().nullish(),
});
export type UpsertEntityLegalDetailsInput = z.infer<typeof UpsertEntityLegalDetailsInputSchema>;
