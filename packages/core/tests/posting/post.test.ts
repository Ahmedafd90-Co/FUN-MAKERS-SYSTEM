import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prisma } from '@fmksa/db';
import { postingService } from '../../src/posting/service';
import { UnknownEventTypeError } from '../../src/posting/event-registry';

// ---------------------------------------------------------------------------
// Posting service post() integration tests
// Requires: Postgres running (DATABASE_URL)
// ---------------------------------------------------------------------------

describe('postingService.post', () => {
  let testProject: { id: string };
  const ts = Date.now();

  beforeAll(async () => {
    // Create entity + currency + project for FK constraints
    const entity = await prisma.entity.create({
      data: {
        code: `ENT-POST-${ts}`,
        name: 'Post Test Entity',
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
        code: `PRJ-POST-${ts}`,
        name: 'Post Test Project',
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

  it('persists a valid event with status posted', async () => {
    const result = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'test-service',
      sourceRecordType: 'test_record',
      sourceRecordId: 'rec-1',
      projectId: testProject.id,
      idempotencyKey: `idem-valid-${ts}`,
      payload: { amount: 100, currency: 'SAR', description: 'Test event' },
      actorUserId: 'user-1',
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe('posted');
    expect(result.eventType).toBe('TEST_EVENT_M1');
    expect(result.postedAt).toBeTruthy();
    expect(result.idempotencyKey).toBe(`idem-valid-${ts}`);
  });

  it('returns existing event on duplicate idempotency key (no new row)', async () => {
    const key = `idem-dup-${ts}`;
    const payload = { amount: 50, currency: 'SAR', description: 'First post' };

    const first = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'test-service',
      sourceRecordType: 'test_record',
      sourceRecordId: 'rec-2',
      projectId: testProject.id,
      idempotencyKey: key,
      payload,
    });

    const second = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'test-service',
      sourceRecordType: 'test_record',
      sourceRecordId: 'rec-2',
      projectId: testProject.id,
      idempotencyKey: key,
      payload,
    });

    expect(second.id).toBe(first.id);

    // Verify only one row exists
    const count = await prisma.postingEvent.count({
      where: { idempotencyKey: key },
    });
    expect(count).toBe(1);
  });

  it('rejects unknown event type', async () => {
    await expect(
      postingService.post({
        eventType: 'NONEXISTENT_EVENT',
        sourceService: 'test-service',
        sourceRecordType: 'test_record',
        sourceRecordId: 'rec-3',
        projectId: testProject.id,
        idempotencyKey: `idem-unknown-${ts}`,
        payload: {},
      }),
    ).rejects.toThrow(UnknownEventTypeError);
  });

  it('rejects invalid payload and creates failed event + exception', async () => {
    const key = `idem-invalid-${ts}`;

    await expect(
      postingService.post({
        eventType: 'TEST_EVENT_M1',
        sourceService: 'test-service',
        sourceRecordType: 'test_record',
        sourceRecordId: 'rec-4',
        projectId: testProject.id,
        idempotencyKey: key,
        payload: { amount: 'not-a-number', currency: 123 },
      }),
    ).rejects.toThrow(); // ZodError

    // Verify failed event was created
    const failedEvent = await prisma.postingEvent.findUnique({
      where: { idempotencyKey: key },
    });
    expect(failedEvent).toBeTruthy();
    expect(failedEvent!.status).toBe('failed');
    expect(failedEvent!.failureReason).toBeTruthy();

    // Verify exception was created
    const exceptions = await prisma.postingException.findMany({
      where: { eventId: failedEvent!.id },
    });
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]!.reason).toBe('payload_validation_failed');
  });

  it('writes audit log on success', async () => {
    const event = await postingService.post({
      eventType: 'TEST_EVENT_M1',
      sourceService: 'test-service',
      sourceRecordType: 'test_record',
      sourceRecordId: 'rec-5',
      projectId: testProject.id,
      idempotencyKey: `idem-audit-${ts}`,
      payload: { amount: 200, currency: 'SAR', description: 'Audit test' },
      actorUserId: 'user-1',
    });

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: 'posting_event_posted',
        resourceType: 'posting_event',
        resourceId: event.id,
      },
    });

    expect(auditLogs).toHaveLength(1);
    const log = auditLogs[0]!;
    expect(log.actorUserId).toBe('user-1');
    expect(log.actorSource).toBe('user');
    expect(log.resourceType).toBe('posting_event');
  });
});
