import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prisma } from '@fmksa/db';
import { postingService } from '../../src/posting/service';
import {
  reversePostingEvent,
  PostingReversalError,
} from '../../src/posting/reversal';

// ---------------------------------------------------------------------------
// Reversal integration tests
// ---------------------------------------------------------------------------

describe('reversePostingEvent', () => {
  let testProject: { id: string };
  const ts = Date.now();

  beforeAll(async () => {
    const entity = await prisma.entity.create({
      data: {
        code: `ENT-REV-${ts}`,
        name: 'Reversal Test Entity',
        type: 'parent',
        status: 'active',
      },
    });

    await prisma.currency.upsert({
      where: { code: 'SAR' },
      update: {},
      create: {
        code: 'SAR',
        name: 'Saudi Riyal',
        symbol: 'SR',
        decimalPlaces: 2,
      },
    });

    testProject = await prisma.project.create({
      data: {
        code: `PRJ-REV-${ts}`,
        name: 'Reversal Test Project',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test-user',
      },
    });
  });

  // NOTE: No truncation between tests. Each test uses unique idempotency keys
  // (suffixed with ts) to avoid collisions, even when test files run in parallel.

  it('creates reversal event with additive semantics', async () => {
    const original = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'test-service',
      sourceRecordType: 'test_record',
      sourceRecordId: 'rec-rev-1',
      projectId: testProject.id,
      idempotencyKey: `idem-rev-1-${ts}`,
      payload: { amount: 500, currency: 'SAR', description: 'Original' },
      actorUserId: 'user-1',
    });

    const { originalEvent, reversalEvent } = await reversePostingEvent({
      originalEventId: original.id,
      reason: 'Billing correction',
      actorUserId: 'user-1',
    });

    // Reversal event has same type and payload, status 'reversed'
    expect(reversalEvent.eventType).toBe('TEST_EVENT_M1');
    expect(reversalEvent.status).toBe('reversed');
    expect(reversalEvent.payloadJson).toEqual(original.payloadJson);
    expect(reversalEvent.id).not.toBe(original.id);

    // Original event gets back-pointer
    expect(originalEvent.reversedByEventId).toBe(reversalEvent.id);
  });

  it('original event gets reversedByEventId back-pointer', async () => {
    const original = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'test-service',
      sourceRecordType: 'test_record',
      sourceRecordId: 'rec-rev-2',
      projectId: testProject.id,
      idempotencyKey: `idem-rev-2-${ts}`,
      payload: { amount: 300, currency: 'SAR', description: 'Back-pointer test' },
      actorUserId: 'user-1',
    });

    await reversePostingEvent({
      originalEventId: original.id,
      reason: 'Test back-pointer',
      actorUserId: 'user-1',
    });

    // Re-fetch from DB to verify persistence
    const refetched = await prisma.postingEvent.findUnique({
      where: { id: original.id },
    });
    expect(refetched!.reversedByEventId).toBeTruthy();
  });

  it('cannot reverse a failed event', async () => {
    // Create a failed event by posting invalid payload
    try {
      await postingService.post({
        eventType: 'TEST_EVENT_M1',
        sourceService: 'test-service',
        sourceRecordType: 'test_record',
        sourceRecordId: 'rec-rev-3',
        projectId: testProject.id,
        idempotencyKey: `idem-rev-fail-${ts}`,
        payload: { invalid: true },
      });
    } catch {
      // expected
    }

    const failedEvent = await prisma.postingEvent.findUnique({
      where: { idempotencyKey: `idem-rev-fail-${ts}` },
    });

    await expect(
      reversePostingEvent({
        originalEventId: failedEvent!.id,
        reason: 'Try to reverse failed',
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(PostingReversalError);
  });

  it('cannot reverse an already-reversed event', async () => {
    const original = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'test-service',
      sourceRecordType: 'test_record',
      sourceRecordId: 'rec-rev-4',
      projectId: testProject.id,
      idempotencyKey: `idem-rev-double-${ts}`,
      payload: { amount: 100, currency: 'SAR', description: 'Double reversal' },
      actorUserId: 'user-1',
    });

    await reversePostingEvent({
      originalEventId: original.id,
      reason: 'First reversal',
      actorUserId: 'user-1',
    });

    await expect(
      reversePostingEvent({
        originalEventId: original.id,
        reason: 'Second reversal attempt',
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(PostingReversalError);
  });

  it('reason is required', async () => {
    const original = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'test-service',
      sourceRecordType: 'test_record',
      sourceRecordId: 'rec-rev-5',
      projectId: testProject.id,
      idempotencyKey: `idem-rev-noreason-${ts}`,
      payload: { amount: 100, currency: 'SAR', description: 'No reason' },
      actorUserId: 'user-1',
    });

    await expect(
      reversePostingEvent({
        originalEventId: original.id,
        reason: '',
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(/[Rr]eason is required/);
  });

  it('writes audit log on reversal', async () => {
    const original = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'test-service',
      sourceRecordType: 'test_record',
      sourceRecordId: 'rec-rev-6',
      projectId: testProject.id,
      idempotencyKey: `idem-rev-audit-${ts}`,
      payload: { amount: 100, currency: 'SAR', description: 'Audit rev' },
      actorUserId: 'user-1',
    });

    await reversePostingEvent({
      originalEventId: original.id,
      reason: 'Audit check',
      actorUserId: 'user-1',
    });

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: 'posting_event_reversed',
        resourceId: original.id,
      },
    });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]!.reason).toBe('Audit check');
  });
});
