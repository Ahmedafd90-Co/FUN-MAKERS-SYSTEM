import { prisma } from '@fmksa/db';
import type { PostingOrigin } from '@fmksa/db';
import { auditService } from '../audit/service';
import { resolveProjectOrgId } from '../org-resolution';
import {
  validatePayload,
  UnknownEventTypeError,
} from './event-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PostInput = {
  eventType: string;
  sourceService: string;
  sourceRecordType: string;
  sourceRecordId: string;
  projectId: string;
  entityId?: string;
  idempotencyKey: string;
  payload: unknown;
  actorUserId?: string;
  /**
   * Provenance flag. Defaults to 'live' (the common path). Set to
   * 'imported_historical' when the event is emitted by a sheet-import
   * committer — this flags downstream reconciliation and ensures the
   * event never shares an idempotency namespace with a live event.
   */
  origin?: PostingOrigin;
  /** Soft FK to ImportBatch. Only meaningful when origin='imported_historical'. */
  importBatchId?: string | null;
  /**
   * Backdated timestamp for historical imports (e.g. an IPA approved in
   * Q2 last year). Ignored for origin='live'. When absent for imported
   * events, falls back to new Date() so the event is still persisted.
   */
  postedAtOverride?: Date | null;
};

// ---------------------------------------------------------------------------
// Posting Service — the ONLY component allowed to create PostingEvent rows
// and mutate financial/KPI state.
// ---------------------------------------------------------------------------

export const postingService = {
  /**
   * Post an event. The core pipeline:
   *
   * 1. Validate event type exists in registry and payload matches schema.
   *    On validation failure: record a failed event + exception, then re-throw.
   * 2. Idempotency check: if an event with the same key exists, return it.
   * 3. Create event in a transaction with an audit log entry.
   */
  async post(input: PostInput) {
    // PIC-108-E: resolve the tenant org once (input.projectId is required) and
    // reuse it for BOTH postingEvent creates (failed-event + posted-event) and
    // the threaded audit log. An append-only ledger row must carry its project's
    // org, never the singleton @default.
    const orgId = await resolveProjectOrgId(input.projectId);

    // 1. Validate event type + payload
    let parsed: unknown;
    try {
      parsed = validatePayload(input.eventType, input.payload);
    } catch (validationError) {
      // If the event type itself is unknown, throw immediately without
      // recording a failed event (there is no schema to validate against).
      if (validationError instanceof UnknownEventTypeError) {
        throw validationError;
      }

      // For payload validation errors (ZodError): record as failed event
      // for traceability, then create exception.
      const event = await prisma.postingEvent.create({
        data: {
          orgId,
          eventType: input.eventType,
          sourceService: input.sourceService,
          sourceRecordType: input.sourceRecordType,
          sourceRecordId: input.sourceRecordId,
          projectId: input.projectId,
          entityId: input.entityId ?? null,
          idempotencyKey: input.idempotencyKey,
          payloadJson: (input.payload ?? {}) as any,
          status: 'failed',
          origin: input.origin ?? 'live',
          importBatchId: input.importBatchId ?? null,
          failureReason:
            validationError instanceof Error
              ? validationError.message
              : String(validationError),
        },
      });

      await prisma.postingException.create({
        data: {
          eventId: event.id,
          reason: 'payload_validation_failed',
        },
      });

      throw validationError; // Re-throw so caller knows it failed
    }

    // 2. Idempotency check -- if event with same key exists, return it
    const existing = await prisma.postingEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;

    // 3. Create event in transaction with audit log
    const origin = input.origin ?? 'live';
    const postedAt =
      origin === 'imported_historical' && input.postedAtOverride
        ? input.postedAtOverride
        : new Date();
    return prisma.$transaction(async (tx) => {
      const event = await tx.postingEvent.create({
        data: {
          orgId,
          eventType: input.eventType,
          sourceService: input.sourceService,
          sourceRecordType: input.sourceRecordType,
          sourceRecordId: input.sourceRecordId,
          projectId: input.projectId,
          entityId: input.entityId ?? null,
          idempotencyKey: input.idempotencyKey,
          payloadJson: parsed as any,
          status: 'posted',
          origin,
          importBatchId: input.importBatchId ?? null,
          postedAt,
        },
      });

      await auditService.log(
        {
          actorUserId: input.actorUserId ?? null,
          actorSource: input.actorUserId ? 'user' : 'system',
          action: 'posting_event_posted',
          resourceType: 'posting_event',
          resourceId: event.id,
          projectId: input.projectId,
          orgId, // PIC-108-E (A′): thread the resolved org into the audit row

          beforeJson: {},
          afterJson: {
            eventType: input.eventType,
            idempotencyKey: input.idempotencyKey,
          },
        },
        tx,
      );

      return event;
    });
  },
};
