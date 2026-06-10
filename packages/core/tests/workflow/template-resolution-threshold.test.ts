/**
 * PIC-41 — amount-triggered tier-escalation mechanism (regression proof).
 *
 * Proves the configurable threshold mechanism added to `resolveTemplate`:
 *
 *   - Unconfigured threshold + any amount → standard default (Commit 1 path)
 *   - Configured threshold + amount within → standard default
 *   - Configured threshold + amount exceeds + high_value exists → escalates
 *   - Malformed threshold value → safe-default to standard (no throw)
 *
 * This is the load-bearing regression proof for the mechanism. Per PIC-49's
 * generalized lesson: a mechanism that's wired but never test-asserted is the
 * exact failure mode PIC-47 was an instance of. The threshold mechanism MUST
 * have a test that fails if the resolver stops honouring the threshold.
 *
 * The test does NOT seed any threshold value in production seed/fixtures —
 * each test sets the projectSetting key in beforeEach and clears in afterEach.
 * The "what threshold value Pico Play uses" decision is governance, not code.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma, SINGLETON_ORG_ID } from '@fmksa/db';
import { resolveTemplate } from '../../src/workflow/template-resolution';
import { assertTestDb } from '../helpers/assert-test-db';

const ts = Date.now();
const TEST_PROJECT_CODE = `PROJ-PIC41-${ts}`;
const TEST_ENTITY_CODE = `ENT-PIC41-${ts}`;
const THRESHOLD_KEY_EXPENSE = 'workflow_template_high_value_threshold:expense';
const THRESHOLD_KEY_PO = 'workflow_template_high_value_threshold:purchase_order';

describe('PIC-41 — amount-triggered tier-escalation mechanism', () => {
  let testProjectId: string;
  let testEntityId: string;

  beforeAll(async () => {
    assertTestDb();
    process.env.SEED_CONTEXT = 'true';

    // Ensure the test DB has the workflow templates this test depends on
    // (expense_standard, expense_high_value, po_standard, po_high_value).
    // db:seed in the test DB should have created them; activate any that
    // a prior test left inactive.
    await prisma.workflowTemplate.updateMany({
      where: {
        code: { in: ['expense_standard', 'expense_high_value', 'po_standard', 'po_high_value'] },
      },
      data: { isActive: true },
    });

    const entity = await prisma.entity.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: TEST_ENTITY_CODE,
        name: 'PIC-41 Threshold Test Entity',
        type: 'parent',
        status: 'active',
      },
    });
    testEntityId = entity.id;

    const project = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: TEST_PROJECT_CODE,
        name: 'PIC-41 Threshold Test Project',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProjectId = project.id;

    delete process.env.SEED_CONTEXT;
  }, 60_000);

  afterAll(async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});
    await prisma.entity.delete({ where: { id: testEntityId } }).catch(() => {});
    delete process.env.SEED_CONTEXT;
  }, 60_000);

  beforeEach(async () => {
    // Reset projectSetting state so each test sees a clean slate.
    await prisma.projectSetting.deleteMany({ where: { projectId: testProjectId } });
  });

  // -------------------------------------------------------------------------
  // Unconfigured threshold — safe default behaviour
  // -------------------------------------------------------------------------

  it('unconfigured threshold + any Expense amount → expense_standard', async () => {
    const result = await resolveTemplate('expense', testProjectId, undefined, 999_999);
    expect(result?.code).toBe('expense_standard');
  });

  it('unconfigured threshold + any PO amount → po_standard', async () => {
    const result = await resolveTemplate('purchase_order', testProjectId, undefined, 999_999_999);
    expect(result?.code).toBe('po_standard');
  });

  it('unconfigured threshold + no amount → standard default (Commit 1 fallback)', async () => {
    const result = await resolveTemplate('expense', testProjectId);
    expect(result?.code).toBe('expense_standard');
  });

  // -------------------------------------------------------------------------
  // Configured threshold — within vs exceeds
  // -------------------------------------------------------------------------

  it('configured Expense threshold 10000 + amount 5000 (within) → expense_standard', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: THRESHOLD_KEY_EXPENSE,
        valueJson: '10000',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    const result = await resolveTemplate('expense', testProjectId, undefined, 5000);
    expect(result?.code).toBe('expense_standard');
  });

  it('configured Expense threshold 10000 + amount 15000 (exceeds) → expense_high_value', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: THRESHOLD_KEY_EXPENSE,
        valueJson: '10000',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    const result = await resolveTemplate('expense', testProjectId, undefined, 15000);
    expect(result?.code).toBe('expense_high_value');
  });

  it('configured Expense threshold 10000 + amount 10000 (equals) → expense_standard (boundary is strict-greater)', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: THRESHOLD_KEY_EXPENSE,
        valueJson: '10000',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    const result = await resolveTemplate('expense', testProjectId, undefined, 10000);
    expect(result?.code).toBe('expense_standard');
  });

  it('configured PO threshold 100000 + amount 50000 (within) → po_standard', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: THRESHOLD_KEY_PO,
        valueJson: '100000',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    const result = await resolveTemplate('purchase_order', testProjectId, undefined, 50000);
    expect(result?.code).toBe('po_standard');
  });

  it('configured PO threshold 100000 + amount 150000 (exceeds) → po_high_value', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: THRESHOLD_KEY_PO,
        valueJson: '100000',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    const result = await resolveTemplate('purchase_order', testProjectId, undefined, 150000);
    expect(result?.code).toBe('po_high_value');
  });

  // -------------------------------------------------------------------------
  // Decimal precision — financial-control safety
  // -------------------------------------------------------------------------

  it('configured threshold 9999.99 + amount 9999.98 (within by 0.01) → standard', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: THRESHOLD_KEY_EXPENSE,
        valueJson: '9999.99',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    const result = await resolveTemplate('expense', testProjectId, undefined, '9999.98');
    expect(result?.code).toBe('expense_standard');
  });

  it('configured threshold 9999.99 + amount 10000.00 (exceeds by 0.01) → high_value', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: THRESHOLD_KEY_EXPENSE,
        valueJson: '9999.99',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    const result = await resolveTemplate('expense', testProjectId, undefined, '10000.00');
    expect(result?.code).toBe('expense_high_value');
  });

  // -------------------------------------------------------------------------
  // Safe-default on malformed config — never silently escalates
  // -------------------------------------------------------------------------

  it('malformed threshold value ("not-a-number") → safe-default to standard (no throw)', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: THRESHOLD_KEY_EXPENSE,
        valueJson: 'not-a-number',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    // Whatever amount; malformed threshold must NEVER cause escalation.
    const result = await resolveTemplate('expense', testProjectId, undefined, 999_999_999);
    expect(result?.code).toBe('expense_standard');
  });
});
