/**
 * Posting lifecycle E2E tests — Phase 1.10
 *
 * Tests the complete posting → reversal chain integrity:
 *   - Post → reverse → verify chain links
 *   - Post → reverse → double-reverse blocked
 *   - Idempotency across the full lifecycle
 *   - Audit trail completeness for post + reverse
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { postingService } from '../../src/posting/service';
import { reversePostingEvent, PostingReversalError } from '../../src/posting/reversal';

describe('posting lifecycle — post → reverse → verify', () => {
  let testProject: { id: string };
  const ts = Date.now();

  beforeAll(async () => {
    const entity = await prisma.entity.create({
      data: {
        code: `ENT-PLC-${ts}`,
        name: 'Posting Lifecycle Entity',
        type: 'parent',
        status: 'active',
      },
    });

    await prisma.currency.upsert({
      where: { code: 'SAR' },
      update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });

    testProject = await prisma.project.create({
      data: {
        code: `PRJ-PLC-${ts}`,
        name: 'Posting Lifecycle Project',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test-user',
      },
    });
  });

  it('full lifecycle: post → reverse → verify chain integrity', async () => {
    // 1. Post the original event
    const original = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'lifecycle-test',
      sourceRecordType: 'test_record',
      sourceRecordId: `rec-plc-1-${ts}`,
      projectId: testProject.id,
      idempotencyKey: `plc-chain-${ts}`,
      payload: { amount: 1000, currency: 'SAR', description: 'Original posting' },
      actorUserId: 'user-1',
    });

    expect(original.status).toBe('posted');
    expect(original.reversedByEventId).toBeNull();

    // 2. Reverse the event
    const { originalEvent, reversalEvent } = await reversePostingEvent({
      originalEventId: original.id,
      reason: 'Billing correction needed',
      actorUserId: 'user-1',
    });

    // 3. Verify chain integrity
    expect(originalEvent.reversedByEventId).toBe(reversalEvent.id);
    expect(reversalEvent.status).toBe('reversed');
    expect(reversalEvent.eventType).toBe(original.eventType);
    expect(reversalEvent.projectId).toBe(original.projectId);
    expect(reversalEvent.sourceRecordId).toBe(original.sourceRecordId);

    // 4. Verify the chain is persisted correctly
    const refetchedOriginal = await prisma.postingEvent.findUnique({
      where: { id: original.id },
    });
    const refetchedReversal = await prisma.postingEvent.findUnique({
      where: { id: reversalEvent.id },
    });

    expect(refetchedOriginal!.reversedByEventId).toBe(refetchedReversal!.id);
    expect(refetchedReversal!.status).toBe('reversed');

    // 5. Verify double-reversal is blocked
    await expect(
      reversePostingEvent({
        originalEventId: original.id,
        reason: 'Second reversal attempt',
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow(PostingReversalError);
  });

  it('audit trail covers both post and reversal', async () => {
    const original = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'lifecycle-test',
      sourceRecordType: 'test_record',
      sourceRecordId: `rec-plc-audit-${ts}`,
      projectId: testProject.id,
      idempotencyKey: `plc-audit-${ts}`,
      payload: { amount: 500, currency: 'SAR', description: 'Audit trail test' },
      actorUserId: 'user-1',
    });

    await reversePostingEvent({
      originalEventId: original.id,
      reason: 'Error correction',
      actorUserId: 'user-1',
    });

    // Check audit logs for the post
    const postLogs = await prisma.auditLog.findMany({
      where: {
        action: 'posting_event_posted',
        resourceId: original.id,
      },
    });
    expect(postLogs).toHaveLength(1);
    expect(postLogs[0]!.actorUserId).toBe('user-1');

    // Check audit logs for the reversal
    const reversalLogs = await prisma.auditLog.findMany({
      where: {
        action: 'posting_event_reversed',
        resourceId: original.id,
      },
    });
    expect(reversalLogs).toHaveLength(1);
    expect(reversalLogs[0]!.reason).toBe('Error correction');
  });

  it('idempotency survives across the full lifecycle', async () => {
    const key = `plc-idem-${ts}`;
    const payload = { amount: 250, currency: 'SAR', description: 'Idempotency test' };

    // Post once
    const first = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'lifecycle-test',
      sourceRecordType: 'test_record',
      sourceRecordId: `rec-plc-idem-${ts}`,
      projectId: testProject.id,
      idempotencyKey: key,
      payload,
      actorUserId: 'user-1',
    });

    // Post again with same key — should return same event
    const duplicate = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'lifecycle-test',
      sourceRecordType: 'test_record',
      sourceRecordId: `rec-plc-idem-${ts}`,
      projectId: testProject.id,
      idempotencyKey: key,
      payload,
      actorUserId: 'user-1',
    });

    expect(duplicate.id).toBe(first.id);

    // Only one row in the DB
    const count = await prisma.postingEvent.count({
      where: { idempotencyKey: key },
    });
    expect(count).toBe(1);

    // Reverse the event
    await reversePostingEvent({
      originalEventId: first.id,
      reason: 'Post-idempotency reversal',
      actorUserId: 'user-1',
    });

    // Verify the reversed event still has the same idempotency key
    const refetched = await prisma.postingEvent.findUnique({
      where: { id: first.id },
    });
    expect(refetched!.idempotencyKey).toBe(key);
    expect(refetched!.reversedByEventId).toBeTruthy();
  });
});
