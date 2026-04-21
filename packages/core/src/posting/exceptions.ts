import { prisma } from '@fmksa/db';
import { randomUUID } from 'crypto';
import { auditService } from '../audit/service';
import { postingService } from './service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ListExceptionsInput = {
  status?: 'open' | 'resolved';
  projectId?: string;
  eventType?: string;
  skip?: number;
  take?: number;
  /**
   * When false/undefined (default), exclude vitest fixture rows from the
   * result set. Admin surfaces should never see these.
   */
  includeTestFixtures?: boolean;
};

// Recognised fixture markers — rows the vitest suite leaves behind on the
// shared dev DB. Keep in sync with packages/core/tests/**/*.test.ts.
// eventType='TEST_EVENT_M1'        ← posting/*.test.ts
// sourceRecordType='test_record'   ← posting/*.test.ts, audit/coverage.test.ts
const TEST_EVENT_TYPES = ['TEST_EVENT_M1'] as const;
const TEST_SOURCE_RECORD_TYPES = ['test_record'] as const;

// ---------------------------------------------------------------------------
// Posting Exception Service
//
// Manages exceptions (failures) produced by the posting pipeline.
// Provides list, detail, retry, and manual resolve.
// ---------------------------------------------------------------------------

export const postingExceptionService = {
  /**
   * List exceptions with optional filters and pagination.
   */
  async listExceptions(input: ListExceptionsInput = {}) {
    const { status, projectId, eventType, skip = 0, take = 50 } = input;
    const includeTestFixtures = input.includeTestFixtures ?? false;

    // Build the where clause
    const where: Record<string, unknown> = {};

    if (status === 'open') {
      where.resolvedAt = null;
    } else if (status === 'resolved') {
      where.resolvedAt = { not: null };
    }

    // Filters that live on the related PostingEvent
    const eventWhere: Record<string, unknown> = {};
    if (projectId) eventWhere.projectId = projectId;
    if (eventType) {
      // Explicit filter wins — caller asked for this specific eventType,
      // don't also apply the notIn (it would be redundant or contradictory).
      eventWhere.eventType = eventType;
    } else if (!includeTestFixtures) {
      // Default-exclude vitest leakage when caller hasn't asked for a
      // specific eventType. The includeTestFixtures flag opts back in.
      eventWhere.eventType = { notIn: TEST_EVENT_TYPES };
    }
    if (!includeTestFixtures) {
      eventWhere.sourceRecordType = { notIn: TEST_SOURCE_RECORD_TYPES };
    }
    if (Object.keys(eventWhere).length > 0) {
      where.event = eventWhere;
    }

    const [exceptions, total] = await Promise.all([
      prisma.postingException.findMany({
        where,
        include: {
          event: {
            include: {
              // Include project name/code so the admin list can show a
              // human identity instead of a sliced UUID.
              project: { select: { id: true, code: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.postingException.count({ where }),
    ]);

    return { exceptions, total, skip, take };
  },

  /**
   * Get a single exception with its related event and audit logs.
   *
   * Enriched for the admin detail sheet with:
   *   - `project` (on the event) so the sheet can show a readable label
   *   - `sourceRecordExists` so the UI can decide whether the source
   *     record reference is clickable or should render as muted text
   *     with a "no longer available" note (matches the pattern used for
   *     absorption exceptions).
   */
  async getException(id: string) {
    const exception = await prisma.postingException.findUnique({
      where: { id },
      include: {
        event: {
          include: {
            project: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!exception) {
      throw new Error(`PostingException '${id}' not found.`);
    }

    // Resolve source-record existence by source type. Mirrors the approach
    // in the absorption-exception router — lets the UI avoid showing
    // clickable links that 404.
    let sourceRecordExists = false;
    try {
      const srid = exception.event.sourceRecordId;
      switch (exception.event.sourceRecordType) {
        case 'purchase_order':
          sourceRecordExists = !!(await prisma.purchaseOrder.findUnique({
            where: { id: srid },
            select: { id: true },
          }));
          break;
        case 'supplier_invoice':
          sourceRecordExists = !!(await prisma.supplierInvoice.findUnique({
            where: { id: srid },
            select: { id: true },
          }));
          break;
        case 'expense':
          sourceRecordExists = !!(await prisma.expense.findUnique({
            where: { id: srid },
            select: { id: true },
          }));
          break;
        case 'credit_note':
          sourceRecordExists = !!(await prisma.creditNote.findUnique({
            where: { id: srid },
            select: { id: true },
          }));
          break;
        default:
          // Unknown / test record type — treat as non-existent. UI renders
          // a muted reference with a "no longer available" note.
          sourceRecordExists = false;
      }
    } catch {
      sourceRecordExists = false;
    }

    // Fetch related audit logs for the event
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        resourceType: 'posting_event',
        resourceId: exception.eventId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { exception, auditLogs, sourceRecordExists };
  },

  /**
   * Retry a failed exception by re-running post() with the original event's
   * data but a new idempotency key.
   *
   * On success: marks the exception resolved with note 'retried_successfully'.
   * On failure: updates the exception reason with the new error.
   */
  async retryException(exceptionId: string, actorUserId: string) {
    const exception = await prisma.postingException.findUnique({
      where: { id: exceptionId },
      include: { event: true },
    });

    if (!exception) {
      throw new Error(`PostingException '${exceptionId}' not found.`);
    }

    if (exception.resolvedAt) {
      throw new Error('Exception is already resolved.');
    }

    const original = exception.event;

    try {
      // Re-run post with a fresh idempotency key
      const newEvent = await postingService.post({
        eventType: original.eventType,
        sourceService: original.sourceService,
        sourceRecordType: original.sourceRecordType,
        sourceRecordId: original.sourceRecordId,
        projectId: original.projectId,
        ...(original.entityId ? { entityId: original.entityId } : {}),
        idempotencyKey: `retry-${exceptionId}-${randomUUID()}`,
        payload: original.payloadJson,
        actorUserId,
      });

      // Mark exception resolved
      const resolved = await prisma.postingException.update({
        where: { id: exceptionId },
        data: {
          resolvedAt: new Date(),
          resolvedBy: actorUserId,
          resolutionNote: 'retried_successfully',
        },
      });

      await auditService.log({
        actorUserId,
        actorSource: 'user',
        action: 'posting_exception_retried',
        resourceType: 'posting_exception',
        resourceId: exceptionId,
        projectId: original.projectId,
        beforeJson: { reason: exception.reason },
        afterJson: {
          resolvedAt: resolved.resolvedAt?.toISOString() ?? null,
          newEventId: newEvent.id,
        },
      });

      return { exception: resolved, newEvent };
    } catch (retryError) {
      // Update exception with new error info
      await prisma.postingException.update({
        where: { id: exceptionId },
        data: {
          reason:
            retryError instanceof Error
              ? `retry_failed: ${retryError.message}`
              : `retry_failed: ${String(retryError)}`,
        },
      });

      await auditService.log({
        actorUserId,
        actorSource: 'user',
        action: 'posting_exception_retry_failed',
        resourceType: 'posting_exception',
        resourceId: exceptionId,
        projectId: original.projectId,
        beforeJson: { reason: exception.reason },
        afterJson: {
          reason:
            retryError instanceof Error
              ? retryError.message
              : String(retryError),
        },
      });

      throw retryError;
    }
  },

  /**
   * Manually resolve an exception with a note. Used when a human determines
   * the exception is acceptable or handled out-of-band.
   */
  async resolveException(
    exceptionId: string,
    note: string,
    actorUserId: string,
  ) {
    const exception = await prisma.postingException.findUnique({
      where: { id: exceptionId },
      include: { event: true },
    });

    if (!exception) {
      throw new Error(`PostingException '${exceptionId}' not found.`);
    }

    if (exception.resolvedAt) {
      throw new Error('Exception is already resolved.');
    }

    const resolved = await prisma.postingException.update({
      where: { id: exceptionId },
      data: {
        resolvedAt: new Date(),
        resolvedBy: actorUserId,
        resolutionNote: note,
      },
    });

    await auditService.log({
      actorUserId,
      actorSource: 'user',
      action: 'posting_exception_resolved',
      resourceType: 'posting_exception',
      resourceId: exceptionId,
      projectId: exception.event.projectId,
      beforeJson: { reason: exception.reason },
      afterJson: { resolutionNote: note },
    });

    return resolved;
  },
};
