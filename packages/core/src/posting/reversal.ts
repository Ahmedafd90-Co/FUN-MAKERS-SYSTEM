import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';

// ---------------------------------------------------------------------------
// Posting Reversal — additive only
//
// From the spec: "The original event's domain values (eventType, payload,
// postedAt, sourceRecord) are never mutated. Setting reversedByEventId is
// the only allowed mutation -- it's a back-pointer for audit traversal."
// ---------------------------------------------------------------------------

export type ReverseInput = {
  originalEventId: string;
  reason: string;
  actorUserId: string;
};

/**
 * Create an additive reversal for a posted event.
 *
 * Creates a NEW PostingEvent that mirrors the original (same eventType,
 * payload) with status 'reversed'. Then sets the back-pointer on the
 * original event (reversedByEventId) -- the ONLY mutation allowed.
 */
export async function reversePostingEvent(input: ReverseInput) {
  const { originalEventId, reason, actorUserId } = input;

  if (!reason || reason.trim().length === 0) {
    throw new Error('Reason is required for posting reversal.');
  }

  const original = await prisma.postingEvent.findUnique({
    where: { id: originalEventId },
  });

  if (!original) {
    throw new Error(`PostingEvent '${originalEventId}' not found.`);
  }

  // Validate: status must be 'posted' (can't reverse failed/pending/already-reversed)
  if (original.status !== 'posted') {
    throw new PostingReversalError(
      `Cannot reverse event with status '${original.status}'. Only 'posted' events can be reversed.`,
    );
  }

  // Check if already reversed via back-pointer
  if (original.reversedByEventId) {
    throw new PostingReversalError(
      `Event '${originalEventId}' has already been reversed by '${original.reversedByEventId}'.`,
    );
  }

  // Execute reversal in a transaction
  return prisma.$transaction(async (tx) => {
    // Create the reversal event
    const reversalEvent = await tx.postingEvent.create({
      data: {
        eventType: original.eventType,
        sourceService: original.sourceService,
        sourceRecordType: original.sourceRecordType,
        sourceRecordId: original.sourceRecordId,
        projectId: original.projectId,
        entityId: original.entityId,
        idempotencyKey: `reversal-${originalEventId}`,
        payloadJson: original.payloadJson as any,
        status: 'reversed',
        postedAt: new Date(),
      },
    });

    // Set back-pointer on original -- the ONLY allowed mutation
    const updatedOriginal = await tx.postingEvent.update({
      where: { id: originalEventId },
      data: { reversedByEventId: reversalEvent.id },
    });

    // Audit log
    await auditService.log(
      {
        actorUserId,
        actorSource: 'user',
        action: 'posting_event_reversed',
        resourceType: 'posting_event',
        resourceId: originalEventId,
        projectId: original.projectId,
        beforeJson: { status: original.status, reversedByEventId: null },
        afterJson: {
          reversalEventId: reversalEvent.id,
          reason,
        },
        reason,
      },
      tx,
    );

    return { originalEvent: updatedOriginal, reversalEvent };
  });
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PostingReversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostingReversalError';
  }
}
