/**
 * Reference data contract schemas — shared between client and server.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// App Settings
// ---------------------------------------------------------------------------

export const GetAppSettingSchema = z.object({
  key: z.string().min(1),
});

export const SetAppSettingSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

// ---------------------------------------------------------------------------
// Status Dictionaries
// ---------------------------------------------------------------------------

export const GetStatusDictSchema = z.object({
  dictionaryCode: z.string().min(1),
});

export const AddStatusDictEntrySchema = z.object({
  dictionaryCode: z.string().min(1, 'Dictionary code is required.'),
  statusCode: z.string().min(1, 'Status code is required.'),
  label: z.string().min(1, 'Label is required.'),
  orderIndex: z.number().int().min(0),
  colorHint: z.string().optional().nullable(),
  isTerminal: z.boolean(),
});

export type AddStatusDictEntryInput = z.infer<typeof AddStatusDictEntrySchema>;

export const UpdateStatusDictEntrySchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).optional(),
  orderIndex: z.number().int().min(0).optional(),
  colorHint: z.string().optional().nullable(),
  isTerminal: z.boolean().optional(),
});

export type UpdateStatusDictEntryInput = z.infer<
  typeof UpdateStatusDictEntrySchema
>;
