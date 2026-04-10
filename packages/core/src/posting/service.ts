import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
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
          eventType: input.eventType,
          sourceService: input.sourceService,
          sourceRecordType: input.sourceRecordType,
          sourceRecordId: input.sourceRecordId,
          projectId: input.projectId,
          entityId: input.entityId ?? null,
          idempotencyKey: input.idempotencyKey,
          payloadJson: (input.payload ?? {}) as any,
          status: 'failed',
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
    return prisma.$transaction(async (tx) => {
      const event = await tx.postingEvent.create({
        data: {
          eventType: input.eventType,
          sourceService: input.sourceService,
          sourceRecordType: input.sourceRecordType,
          sourceRecordId: input.sourceRecordId,
          projectId: input.projectId,
          entityId: input.entityId ?? null,
          idempotencyKey: input.idempotencyKey,
          payloadJson: parsed as any,
          status: 'posted',
          postedAt: new Date(),
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
