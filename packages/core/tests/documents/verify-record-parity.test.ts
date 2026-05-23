/**
 * PIC-51 — recordType registry parity guard (regression proof).
 *
 * Two halves to the registry mechanism, two places drift can hide:
 *   - The const `RECORD_TYPES_FOR_DOCUMENTS` in `@fmksa/contracts` (canonical source).
 *   - The switch statement in `verifyRecordInProject` in `@fmksa/core`.
 *
 * If they drift apart, the failure mode is silent:
 *   - Const entry without switch case → at the API boundary the Zod enum accepts
 *     the type, but at the service layer `verifyRecordInProject` falls through
 *     to `default` and throws `UnsupportedRecordTypeError`. The user sees a
 *     5xx for what looked like a valid request.
 *   - Switch case without const entry → API boundary rejects the type via Zod
 *     enum before reaching the switch. The case becomes dead code; harmless
 *     but a hygiene issue.
 *
 * This test is the structural guard against both drift modes. Per the PIC-49
 * lesson — a mechanism guarding against a failure mode MUST have a test that
 * proves the failure case is caught, not just one that proves the happy path
 * — the test includes a deliberately-divergent fixture that simulates "what
 * if someone added an entry to the const without adding the switch case"
 * and confirms the parity check fires on it.
 */

import { describe, it, expect } from 'vitest';
import {
  RECORD_TYPES_FOR_DOCUMENTS,
  DocumentRecordTypeSchema,
  CreateDocumentSchema,
} from '@fmksa/contracts';
import { verifyRecordInProject, UnsupportedRecordTypeError } from '@fmksa/core';
import { assertTestDb } from '../helpers/assert-test-db';

const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

describe('PIC-51 — recordType registry parity guard', () => {
  // -------------------------------------------------------------------------
  // Half 1 — const → switch parity
  //
  // For every value in RECORD_TYPES_FOR_DOCUMENTS, verifyRecordInProject MUST
  // reach a case (Prisma is called, throws not-found because fake UUID). It
  // MUST NOT throw UnsupportedRecordTypeError — that would mean a registered
  // type is unhandled (drift mode 1).
  // -------------------------------------------------------------------------

  describe('const → switch parity', () => {
    it.each(RECORD_TYPES_FOR_DOCUMENTS)(
      'registered recordType %s reaches a switch case (does not throw UnsupportedRecordTypeError)',
      async (recordType) => {
        assertTestDb();
        let caughtError: Error | undefined;
        try {
          await verifyRecordInProject(recordType, FAKE_UUID, FAKE_UUID);
        } catch (err) {
          caughtError = err as Error;
        }
        // We expect Prisma's not-found error (because FAKE_UUID doesn't
        // exist) — that proves the case was hit. We must NOT see
        // UnsupportedRecordTypeError, which would mean drift.
        expect(caughtError).toBeDefined();
        expect(caughtError).not.toBeInstanceOf(UnsupportedRecordTypeError);
      },
    );

    it('unregistered recordType → UnsupportedRecordTypeError (negative case)', async () => {
      assertTestDb();
      await expect(
        verifyRecordInProject('fake_unregistered_entity', FAKE_UUID, FAKE_UUID),
      ).rejects.toBeInstanceOf(UnsupportedRecordTypeError);
    });
  });

  // -------------------------------------------------------------------------
  // Half 2 — Zod enum ↔ const parity
  //
  // The Zod enum derives from the const at module load. If they got out of
  // sync (e.g. someone hand-edited the Zod enum), the API boundary would
  // reject what the const says is valid. These tests assert the round-trip
  // works in both directions.
  // -------------------------------------------------------------------------

  describe('Zod enum ↔ const parity', () => {
    it.each(RECORD_TYPES_FOR_DOCUMENTS)(
      'DocumentRecordTypeSchema accepts registered recordType %s',
      (recordType) => {
        const result = DocumentRecordTypeSchema.safeParse(recordType);
        expect(result.success).toBe(true);
      },
    );

    it('DocumentRecordTypeSchema rejects unregistered recordType', () => {
      const result = DocumentRecordTypeSchema.safeParse('fake_unregistered_entity');
      expect(result.success).toBe(false);
    });

    it.each(RECORD_TYPES_FOR_DOCUMENTS)(
      'CreateDocumentSchema accepts registered recordType %s',
      (recordType) => {
        const result = CreateDocumentSchema.safeParse({
          projectId: FAKE_UUID,
          title: 'Test',
          category: 'general',
          recordType,
          recordId: FAKE_UUID,
        });
        expect(result.success).toBe(true);
      },
    );

    it('CreateDocumentSchema rejects unregistered recordType', () => {
      const result = CreateDocumentSchema.safeParse({
        projectId: FAKE_UUID,
        title: 'Test',
        category: 'general',
        recordType: 'fake_unregistered_entity',
        recordId: FAKE_UUID,
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Deliberately-divergent fixture (PIC-49 load-bearing proof)
  //
  // Per the PIC-49 lesson, a guard without a test proving it catches the
  // failure case is unproven. Here we synthesise the exact drift mode the
  // parity check exists to detect — a const entry that has no switch case —
  // and run the same parity check against the synthetic divergent set.
  // The test passes if and only if the parity check correctly identifies
  // the divergent entry as an offender.
  //
  // If this test ever fails, it means the parity-check logic itself is
  // broken (it stopped catching divergence). That is the load-bearing
  // proof — the const → switch parity test above is only as strong as
  // this fixture proves it to be.
  // -------------------------------------------------------------------------

  describe('deliberately-divergent fixture (PIC-49 load-bearing proof)', () => {
    it('parity check detects a const entry that has no switch case', async () => {
      assertTestDb();
      // Synthesise drift: extend the real const with a fake entry that
      // verifyRecordInProject has no case for. If someone added 'drawing'
      // to the real const without adding `case 'drawing':`, this is
      // exactly the shape of that mistake.
      const SYNTHETIC_DIVERGENT = [
        ...RECORD_TYPES_FOR_DOCUMENTS,
        'fake_unregistered_entity',
      ] as const;

      // Run the parity check against the synthetic divergent set and
      // collect every entry that falls through to `default` (the drift
      // signal).
      const offenders: string[] = [];
      for (const recordType of SYNTHETIC_DIVERGENT) {
        try {
          await verifyRecordInProject(recordType, FAKE_UUID, FAKE_UUID);
        } catch (err) {
          if (err instanceof UnsupportedRecordTypeError) {
            offenders.push(recordType);
          }
          // Prisma not-found errors are NOT drift; they mean the case was
          // hit and Prisma was called (the expected path for a registered
          // type with a fake UUID).
        }
      }

      // The synthetic divergent set MUST produce exactly one offender —
      // the fake entry — and no others. If real registered types start
      // appearing here, that's drift in the real const-vs-switch pair
      // and the const → switch parity tests above will fail too.
      expect(offenders).toEqual(['fake_unregistered_entity']);
    });
  });
});
