import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prisma } from '@fmksa/db';
import { postingService } from '../../src/posting/service';
import { postingExceptionService } from '../../src/posting/exceptions';

// ---------------------------------------------------------------------------
// Posting exception service integration tests
// ---------------------------------------------------------------------------

describe('postingExceptionService', () => {
  let testProject: { id: string };
  const ts = Date.now();

  beforeAll(async () => {
    const entity = await prisma.entity.create({
      data: {
        code: `ENT-EXC-${ts}`,
        name: 'Exception Test Entity',
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
        code: `PRJ-EXC-${ts}`,
        name: 'Exception Test Project',
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

  /**
   * Helper: create a failed event + exception by posting invalid payload.
   */
  async function createFailedException(key: string) {
    try {
      await postingService.post({
        eventType: 'TEST_EVENT_M1',
        sourceService: 'test-service',
        sourceRecordType: 'test_record',
        sourceRecordId: 'rec-exc',
        projectId: testProject.id,
        idempotencyKey: key,
        payload: { amount: 'bad', currency: 123 }, // invalid
      });
    } catch {
      // expected
    }

    const event = await prisma.postingEvent.findUnique({
      where: { idempotencyKey: key },
    });
    const exception = await prisma.postingException.findFirst({
      where: { eventId: event!.id },
    });

    return { event: event!, exception: exception! };
  }

  describe('listExceptions', () => {
    it('returns paginated list with filter by status=open', async () => {
      await createFailedException(`exc-list-open-${ts}`);

      const result = await postingExceptionService.listExceptions({
        status: 'open',
      });

      expect(result.exceptions.length).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeGreaterThanOrEqual(1);
      // All returned should be unresolved
      for (const exc of result.exceptions) {
        expect(exc.resolvedAt).toBeNull();
      }
    });

    it('filters by projectId', async () => {
      await createFailedException(`exc-list-proj-${ts}`);

      const result = await postingExceptionService.listExceptions({
        projectId: testProject.id,
      });

      expect(result.exceptions.length).toBeGreaterThanOrEqual(1);
      for (const exc of result.exceptions) {
        expect(exc.event.projectId).toBe(testProject.id);
      }
    });

    it('filters by eventType', async () => {
      await createFailedException(`exc-list-type-${ts}`);

      const result = await postingExceptionService.listExceptions({
        eventType: 'TEST_EVENT_M1',
      });

      expect(result.exceptions.length).toBeGreaterThanOrEqual(1);
      for (const exc of result.exceptions) {
        expect(exc.event.eventType).toBe('TEST_EVENT_M1');
      }
    });
  });

  describe('retryException', () => {
    it('succeeds and marks exception resolved when original payload is now valid', async () => {
      // Create an event that failed due to payload validation.
      // To make retry succeed, we manually update the failed event's payload
      // to a valid one before retrying.
      const { event, exception } = await createFailedException(`exc-retry-ok-${ts}`);

      // Fix the payload in the failed event so retry will succeed
      await prisma.postingEvent.update({
        where: { id: event.id },
        data: {
          payloadJson: {
            amount: 100,
            currency: 'SAR',
            description: 'Fixed payload',
          },
        },
      });

      const result = await postingExceptionService.retryException(
        exception.id,
        'admin-user',
      );

      expect(result.exception.resolvedAt).toBeTruthy();
      expect(result.exception.resolvedBy).toBe('admin-user');
      expect(result.exception.resolutionNote).toBe('retried_successfully');
      expect(result.newEvent.status).toBe('posted');
    });

    it('fails and updates exception reason on re-failure', async () => {
      // Leave invalid payload -- retry will fail again
      const { exception } = await createFailedException(`exc-retry-fail-${ts}`);

      await expect(
        postingExceptionService.retryException(exception.id, 'admin-user'),
      ).rejects.toThrow();

      // Check exception reason was updated
      const updated = await prisma.postingException.findUnique({
        where: { id: exception.id },
      });
      expect(updated!.reason).toMatch(/retry_failed/);
    });
  });

  describe('resolveException', () => {
    it('resolves with note successfully', async () => {
      const { exception } = await createFailedException(`exc-resolve-${ts}`);

      const resolved = await postingExceptionService.resolveException(
        exception.id,
        'Manually verified -- acceptable variance',
        'admin-user',
      );

      expect(resolved.resolvedAt).toBeTruthy();
      expect(resolved.resolvedBy).toBe('admin-user');
      expect(resolved.resolutionNote).toBe(
        'Manually verified -- acceptable variance',
      );
    });

    it('cannot resolve an already-resolved exception', async () => {
      const { exception } = await createFailedException(`exc-resolve-dup-${ts}`);

      await postingExceptionService.resolveException(
        exception.id,
        'First resolve',
        'admin-user',
      );

      await expect(
        postingExceptionService.resolveException(
          exception.id,
          'Second resolve',
          'admin-user',
        ),
      ).rejects.toThrow(/already resolved/);
    });

    it('writes audit log on resolve', async () => {
      const { exception } = await createFailedException(`exc-resolve-audit-${ts}`);

      await postingExceptionService.resolveException(
        exception.id,
        'Audit check resolve',
        'admin-user',
      );

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          action: 'posting_exception_resolved',
          resourceId: exception.id,
        },
      });

      expect(auditLogs).toHaveLength(1);
    });
  });
});
