import { prisma } from '@fmksa/db';

/**
 * Minimal transaction client type. Within a Prisma `$transaction` callback
 * the client exposes model accessors but not lifecycle or transaction methods.
 * We keep this deliberately loose (`unknown`) so we don't import
 * `@prisma/client` directly — that dependency lives in `@fmksa/db`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type TransactionClient = Record<string, unknown>;

/**
 * JSON-serializable value accepted by Prisma for Json columns.
 */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export type AuditEntry = {
  actorUserId?: string | null;
  actorSource: 'user' | 'system' | 'agent' | 'job';
  action: string;
  resourceType: string;
  resourceId: string;
  projectId?: string | null;
  beforeJson: JsonValue;
  afterJson: JsonValue;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export const auditService = {
  /**
   * Write an append-only audit log entry.
   *
   * @param entry - The audit data to log.
   * @param tx - Optional Prisma transaction client. When provided the audit
   *   entry is written inside the caller's transaction (same commit boundary).
   *   When omitted, writes in its own implicit transaction.
   */
  async log(entry: AuditEntry, tx?: TransactionClient) {
    if (entry.actorSource === 'user' && !entry.actorUserId) {
      throw new Error(
        'auditService.log: actorUserId is required when actorSource is "user"',
      );
    }

    // Use the transaction client when provided, otherwise the singleton.
    // Cast to `any` because the extended prisma type doesn't exactly match
    // PrismaClient — the underlying model accessors are the same.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (tx ?? prisma) as any;

    return client.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        actorSource: entry.actorSource,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        projectId: entry.projectId ?? null,
        beforeJson: entry.beforeJson,
        afterJson: entry.afterJson,
        reason: entry.reason ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  },
};
