import { prisma } from '../../src/client';
import { assertTestDb } from './assert-test-db';
import { SINGLETON_ORG_ID } from '../../src/index';

export async function createTestUser(
  overrides?: Partial<{
    email: string;
    name: string;
    passwordHash: string;
    status: 'active' | 'inactive' | 'locked';
  }>,
) {
  return prisma.user.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      email: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      name: 'Test User',
      passwordHash: 'test-hash',
      status: 'active',
      ...overrides,
    },
  });
}

export async function createTestEntity() {
  return prisma.entity.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      code: `ENT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Test Entity',
      type: 'parent',
      status: 'active',
    },
  });
}

export async function createTestProject(entityId: string) {
  return prisma.project.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      code: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Test Project',
      entityId,
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      status: 'active',
    },
  });
}

export async function createTestDocumentWithVersion(
  projectId: string,
  uploadedBy: string,
  isSigned = false,
) {
  const doc = await prisma.document.create({
    data: {
      orgId: SINGLETON_ORG_ID,
      projectId,
      title: 'Test Doc',
      category: 'general',
      status: isSigned ? 'signed' : 'draft',
      createdBy: uploadedBy,
    },
  });

  const version = await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      versionNo: 1,
      fileKey: `files/test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`,
      fileHash: `sha256-test-${Math.random().toString(36).slice(2, 10)}`,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy,
      uploadedAt: new Date(),
      isSigned,
      ...(isSigned ? { signedAt: new Date(), signedBy: uploadedBy } : {}),
    },
  });

  return { doc, version };
}

/**
 * Clean transactional test data while preserving seeded reference data.
 * Uses raw TRUNCATE to avoid both FK ordering headaches and the
 * no-delete-on-immutable middleware. TRUNCATE ... CASCADE handles
 * dependencies automatically.
 *
 * Scope rationale (β2 documentation per PIC-76, 2026-05-27):
 *
 * This function TRUNCATEs 16 tables — transactional + workflow + audit data.
 * It deliberately PRESERVES the 5 reference-data tables (users, roles,
 * permissions, currencies, countries) plus 5 reference-derived tables
 * (user_roles, role_permissions, status_dictionaries, app_settings,
 * notification_templates) that are populated once by db:seed. Middleware
 * tests calling this helper don't need to re-seed reference data — they
 * test middleware behavior on transactional tables.
 *
 * Distinct from `packages/db/tests/seed/idempotency.test.ts`'s inline
 * TRUNCATE (13 tables) which DOES wipe reference tables because that test's
 * beforeAll explicitly re-runs the full seed sequence. The two scopes are
 * intentionally different per design intent:
 *   - cleanTestData (here) = transactional clean, preserve reference data
 *   - idempotency.test.ts TRUNCATE = full wipe, re-seed everything
 *
 * Under PIC-76 F3 per-package test DBs, neither scope leaks across packages
 * since @fmksa/db tests run against `fmksa_test_db` and @fmksa/core tests
 * run against `fmksa_test_core`. The scope distinction now only affects
 * intra-package consistency.
 *
 * PIC-37: assertTestDb() at the top is the inline guardrail — even if the
 * vitest setup file is bypassed, this function refuses to TRUNCATE against
 * any database whose URL doesn't contain `_test`.
 */
export async function cleanTestData() {
  assertTestDb();
  // Use a single raw statement with TRUNCATE CASCADE for all test tables.
  // This is the most reliable approach for test cleanup.
  await (prisma as any).$executeRaw`
    TRUNCATE TABLE
      document_signatures,
      document_versions,
      documents,
      audit_logs,
      override_logs,
      workflow_actions,
      workflow_instances,
      workflow_steps,
      workflow_templates,
      posting_exceptions,
      posting_events,
      screen_permissions,
      project_assignments,
      project_settings,
      projects,
      entities
    CASCADE
  `;
  // Don't delete users/roles/permissions/currencies/countries — they're seeded
}
