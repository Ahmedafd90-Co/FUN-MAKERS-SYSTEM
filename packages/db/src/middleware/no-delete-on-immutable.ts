import { Prisma } from '@prisma/client';

/**
 * Append-only tables that MUST NOT support delete or deleteMany via the
 * Prisma client. Deletions on these tables should only happen via raw SQL
 * (e.g. TRUNCATE in tests or a DBA migration).
 */
const IMMUTABLE_MODELS = [
  'AuditLog',
  'OverrideLog',
  'PostingEvent',
  'WorkflowAction',
  'DocumentSignature',
] as const;

const IMMUTABLE_SET = new Set<string>(IMMUTABLE_MODELS);

/**
 * Prisma Client Extension that blocks `delete` and `deleteMany` on the
 * platform's append-only / immutable tables.
 */
export const noDeleteOnImmutableExtension = Prisma.defineExtension({
  name: 'no-delete-on-immutable',
  query: {
    $allModels: {
      async delete({ model, args, query }) {
        if (IMMUTABLE_SET.has(model)) {
          throw new Error(
            `Cannot delete from immutable table: ${model}. This table is append-only.`,
          );
        }
        return query(args);
      },
      async deleteMany({ model, args, query }) {
        if (IMMUTABLE_SET.has(model)) {
          throw new Error(
            `Cannot deleteMany from immutable table: ${model}. This table is append-only.`,
          );
        }
        return query(args);
      },
    },
  },
});
