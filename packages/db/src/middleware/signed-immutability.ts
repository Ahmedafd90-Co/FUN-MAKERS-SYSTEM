import { Prisma } from '@prisma/client';

/**
 * Fields that MAY be updated on a signed DocumentVersion.
 *
 * Per spec SS7.3 the only mutation allowed on a signed version is
 * supersession (setting supersededAt + supersededByVersionId).
 */
const ALLOWED_FIELDS_ON_SIGNED = new Set([
  'supersededAt',
  'supersededByVersionId',
]);

/**
 * Prisma Client Extension that enforces immutability on signed document
 * versions.
 *
 * Rules:
 * 1. UPDATE on a signed version is rejected unless the ONLY fields being
 *    changed are in ALLOWED_FIELDS_ON_SIGNED.
 * 2. DELETE on a signed version is always rejected.
 * 3. Unsigned versions are unaffected.
 */
export const signedImmutabilityExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    name: 'signed-immutability',
    query: {
      documentVersion: {
        async update({ args, query }) {
          // Fetch the current signed state BEFORE the update using the base
          // client so we don't re-trigger our own hook.
          const current = (await client.$queryRaw`
            SELECT is_signed FROM document_versions WHERE id = ${args.where.id}
          `) as Array<{ is_signed: boolean }>;

          if (current[0]?.is_signed) {
            const dataKeys = Object.keys(args.data ?? {});
            const violating = dataKeys.filter(
              (k) => !ALLOWED_FIELDS_ON_SIGNED.has(k),
            );
            if (violating.length > 0) {
              throw new Error(
                `Cannot modify signed document version. Disallowed fields: ${violating.join(', ')}. ` +
                `Only supersession (supersededAt, supersededByVersionId) is allowed on signed versions.`,
              );
            }
          }

          return query(args);
        },

        async delete({ args, query }) {
          const current = (await client.$queryRaw`
            SELECT is_signed FROM document_versions WHERE id = ${args.where.id}
          `) as Array<{ is_signed: boolean }>;

          if (current[0]?.is_signed) {
            throw new Error('Cannot delete a signed document version.');
          }

          return query(args);
        },
      },
    },
  });
});
