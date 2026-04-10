/**
 * Posting contract schemas -- shared between client and server.
 *
 * Defines Zod schemas for posting event queries, exception management,
 * and related input/output types. The posting pipeline itself is
 * server-side only; these schemas support the admin tRPC router.
 *
 * Task 1.7.7
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// PostingEvent read schemas
// ---------------------------------------------------------------------------

export const PostingEventStatusSchema = z.enum([
  'pending',
  'posted',
  'reversed',
  'failed',
]);
export type PostingEventStatus = z.infer<typeof PostingEventStatusSchema>;

export const ListPostingEventsInputSchema = z.object({
  projectId: z.string().uuid().optional(),
  eventType: z.string().optional(),
  status: PostingEventStatusSchema.optional(),
  skip: z.number().int().nonnegative().default(0),
  take: z.number().int().positive().max(100).default(50),
});
export type ListPostingEventsInput = z.infer<
  typeof ListPostingEventsInputSchema
>;

export const GetPostingEventInputSchema = z.object({
  id: z.string().uuid(),
});
export type GetPostingEventInput = z.infer<typeof GetPostingEventInputSchema>;

// ---------------------------------------------------------------------------
// PostingException schemas
// ---------------------------------------------------------------------------

export const ExceptionStatusFilterSchema = z.enum(['open', 'resolved']);

export const ListPostingExceptionsInputSchema = z.object({
  status: ExceptionStatusFilterSchema.optional(),
  projectId: z.string().uuid().optional(),
  eventType: z.string().optional(),
  skip: z.number().int().nonnegative().default(0),
  take: z.number().int().positive().max(100).default(50),
});
export type ListPostingExceptionsInput = z.infer<
  typeof ListPostingExceptionsInputSchema
>;

export const GetPostingExceptionInputSchema = z.object({
  id: z.string().uuid(),
});
export type GetPostingExceptionInput = z.infer<
  typeof GetPostingExceptionInputSchema
>;

export const RetryPostingExceptionInputSchema = z.object({
  exceptionId: z.string().uuid(),
});
export type RetryPostingExceptionInput = z.infer<
  typeof RetryPostingExceptionInputSchema
>;

export const ResolvePostingExceptionInputSchema = z.object({
  exceptionId: z.string().uuid(),
  note: z.string().min(1, 'Resolution note is required.'),
});
export type ResolvePostingExceptionInput = z.infer<
  typeof ResolvePostingExceptionInputSchema
>;
