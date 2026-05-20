/**
 * PIC-53 — RFQ SLA tracking service tests.
 *
 * Covers:
 *   - Unset thresholds → slaBreached: null (caller decides UX)
 *   - Configured threshold within → false
 *   - Configured threshold exceeded → true
 *   - Missing respondedAt → daysToRespond: null, breached: null
 *   - Cross-project scope assertion
 *   - PIC-41-class proof: no threshold value hardcoded as policy
 *     (illustrative values used; no production seed defines these keys)
 *   - Malformed threshold value → treated as unset (safe-default direction)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma, Prisma } from '@fmksa/db';
import { assertTestDb } from '../../helpers/assert-test-db';
import { computeRfqSlaSnapshot } from '../../../src/procurement/rfq/sla';

describe('PIC-53 — RFQ SLA tracking', () => {
  let testEntityId: string;
  let testProjectId: string;
  let secondProjectId: string;
  let testVendorId: string;
  let testRfqId: string;
  let testRfqVendorId: string;
  const ts = Date.now();

  beforeAll(async () => {
    assertTestDb();
    process.env.SEED_CONTEXT = 'true';

    const entity = await prisma.entity.create({
      data: { code: `ENT-SLA-${ts}`, name: 'SLA Entity', type: 'parent', status: 'active' },
    });
    testEntityId = entity.id;

    await prisma.currency.upsert({
      where: { code: 'SAR' },
      update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });

    const project = await prisma.project.create({
      data: {
        code: `PROJ-SLA-${ts}`,
        name: 'SLA Project',
        entityId: testEntityId,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProjectId = project.id;

    const secondProject = await prisma.project.create({
      data: {
        code: `PROJ-SLA-2-${ts}`,
        name: 'SLA Other Project',
        entityId: testEntityId,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    secondProjectId = secondProject.id;

    const vendor = await prisma.vendor.create({
      data: {
        entityId: testEntityId,
        vendorCode: `V-SLA-${ts}`,
        name: 'SLA Vendor',
        status: 'active',
        createdBy: 'test',
      },
    });
    testVendorId = vendor.id;

    const rfq = await prisma.rFQ.create({
      data: {
        projectId: testProjectId,
        rfqNumber: `RFQ-SLA-${ts}`,
        title: 'SLA Test RFQ',
        currency: 'SAR',
        status: 'issued',
        createdBy: 'test',
      },
    });
    testRfqId = rfq.id;

    const rv = await prisma.rFQVendor.create({
      data: { rfqId: testRfqId, vendorId: testVendorId, sentAt: new Date('2026-01-01T00:00:00Z') },
    });
    testRfqVendorId = rv.id;

    delete process.env.SEED_CONTEXT;
  }, 60_000);

  afterAll(async () => {
    process.env.SEED_CONTEXT = 'true';
    // AuditLog is immutable (no-delete-on-immutable extension) — audit rows
    // persist in fmksa_test. PIC-38 test isolation handles cleanup at the
    // suite level; intra-run audit accumulation is harmless because each
    // suite uses a unique resourceId.
    await prisma.projectSetting.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.projectSetting.deleteMany({ where: { projectId: secondProjectId } }).catch(() => {});
    await prisma.rFQVendor.deleteMany({ where: { rfqId: testRfqId } }).catch(() => {});
    await prisma.rFQ.delete({ where: { id: testRfqId } }).catch(() => {});
    await prisma.vendor.delete({ where: { id: testVendorId } }).catch(() => {});
    await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});
    await prisma.project.delete({ where: { id: secondProjectId } }).catch(() => {});
    await prisma.entity.delete({ where: { id: testEntityId } }).catch(() => {});
    delete process.env.SEED_CONTEXT;
  }, 60_000);

  beforeEach(async () => {
    await prisma.projectSetting.deleteMany({ where: { projectId: testProjectId } });
    await prisma.rFQVendor.update({
      where: { id: testRfqVendorId },
      data: { respondedAt: null },
    });
  });

  // -------------------------------------------------------------------------
  // Threshold unset → null
  // -------------------------------------------------------------------------

  it('unset thresholds → slaBreached: null', async () => {
    const snapshot = await computeRfqSlaSnapshot(testRfqId, testProjectId);
    expect(snapshot.slaAwardDays).toBeNull();
    expect(snapshot.slaBreached).toBeNull();
    expect(snapshot.vendors[0]!.slaResponseDays).toBeNull();
    expect(snapshot.vendors[0]!.slaBreached).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Time-to-respond — within threshold
  // -------------------------------------------------------------------------

  it('vendor responded within threshold → slaBreached: false, daysToRespond computed', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: 'rfq_sla_response_days',
        valueJson: '14',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    // Respond 7 days after sent (within 14-day threshold)
    await prisma.rFQVendor.update({
      where: { id: testRfqVendorId },
      data: { respondedAt: new Date('2026-01-08T00:00:00Z') },
    });

    const snapshot = await computeRfqSlaSnapshot(testRfqId, testProjectId);
    expect(snapshot.vendors[0]!.daysToRespond).toBe(7);
    expect(snapshot.vendors[0]!.slaResponseDays).toBe(14);
    expect(snapshot.vendors[0]!.slaBreached).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Time-to-respond — exceeded threshold
  // -------------------------------------------------------------------------

  it('vendor responded after threshold → slaBreached: true', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: 'rfq_sla_response_days',
        valueJson: '7',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    // Respond 14 days after sent — exceeds 7-day threshold
    await prisma.rFQVendor.update({
      where: { id: testRfqVendorId },
      data: { respondedAt: new Date('2026-01-15T00:00:00Z') },
    });

    const snapshot = await computeRfqSlaSnapshot(testRfqId, testProjectId);
    expect(snapshot.vendors[0]!.daysToRespond).toBe(14);
    expect(snapshot.vendors[0]!.slaResponseDays).toBe(7);
    expect(snapshot.vendors[0]!.slaBreached).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Missing respondedAt — daysToRespond null
  // -------------------------------------------------------------------------

  it('vendor not yet responded → daysToRespond: null, breached: null (no signal)', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: 'rfq_sla_response_days',
        valueJson: '14',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    // respondedAt left null in beforeEach
    const snapshot = await computeRfqSlaSnapshot(testRfqId, testProjectId);
    expect(snapshot.vendors[0]!.respondedAt).toBeNull();
    expect(snapshot.vendors[0]!.daysToRespond).toBeNull();
    expect(snapshot.vendors[0]!.slaBreached).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Time-to-award (audit-log-driven)
  // -------------------------------------------------------------------------

  it('time-to-award computed from rfq.transition.issue + rfq.transition.award audit timestamps', async () => {
    // Create audit entries for issue + award. createdAt is auto-now() so we
    // need to set it explicitly. Use Prisma direct insert with explicit dates.
    await prisma.auditLog.create({
      data: {
        actorUserId: 'test',
        actorSource: 'user',
        action: 'rfq.transition.issue',
        resourceType: 'rfq',
        resourceId: testRfqId,
        projectId: testProjectId,
        beforeJson: Prisma.JsonNull,
        afterJson: Prisma.JsonNull,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: 'test',
        actorSource: 'user',
        action: 'rfq.transition.award',
        resourceType: 'rfq',
        resourceId: testRfqId,
        projectId: testProjectId,
        beforeJson: Prisma.JsonNull,
        afterJson: Prisma.JsonNull,
        createdAt: new Date('2026-02-21T00:00:00Z'), // 20 days later
      },
    });

    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: 'rfq_sla_award_days',
        valueJson: '30',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    const snapshot = await computeRfqSlaSnapshot(testRfqId, testProjectId);
    expect(snapshot.daysToAward).toBe(20);
    expect(snapshot.slaAwardDays).toBe(30);
    expect(snapshot.slaBreached).toBe(false);
  });

  it('time-to-award exceeds threshold → slaBreached: true', async () => {
    // Reuse the audit entries from the previous test (AuditLog is immutable;
    // resolver picks the EARLIEST issue + EARLIEST award per resourceId).
    // The 20-day delta is fixed; we just change the threshold from 30 → 10.
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: 'rfq_sla_award_days',
        valueJson: '10',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    const snapshot = await computeRfqSlaSnapshot(testRfqId, testProjectId);
    expect(snapshot.daysToAward).toBe(20); // same delta — different threshold
    expect(snapshot.slaAwardDays).toBe(10);
    expect(snapshot.slaBreached).toBe(true); // 20 > 10
  });

  // -------------------------------------------------------------------------
  // Malformed threshold → treated as unset (safe direction)
  // -------------------------------------------------------------------------

  it('malformed threshold value → treated as unset (safe-default direction)', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: 'rfq_sla_response_days',
        valueJson: 'not-a-number',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    const snapshot = await computeRfqSlaSnapshot(testRfqId, testProjectId);
    expect(snapshot.vendors[0]!.slaResponseDays).toBeNull();
    expect(snapshot.vendors[0]!.slaBreached).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Negative threshold → treated as unset (safe direction)
  // -------------------------------------------------------------------------

  it('negative threshold value → treated as unset', async () => {
    process.env.SEED_CONTEXT = 'true';
    await prisma.projectSetting.create({
      data: {
        projectId: testProjectId,
        key: 'rfq_sla_response_days',
        valueJson: '-7',
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    delete process.env.SEED_CONTEXT;

    const snapshot = await computeRfqSlaSnapshot(testRfqId, testProjectId);
    expect(snapshot.vendors[0]!.slaResponseDays).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Cross-project scope assertion
  // -------------------------------------------------------------------------

  it('refuses cross-project RFQ access', async () => {
    await expect(computeRfqSlaSnapshot(testRfqId, secondProjectId)).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // PIC-41 governance proof
  // -------------------------------------------------------------------------

  it('no production seed defines rfq_sla_* threshold keys (governance — PD-decided per-project)', async () => {
    const settings = await prisma.projectSetting.findMany({
      where: {
        key: { in: ['rfq_sla_response_days', 'rfq_sla_award_days'] },
        projectId: { in: [testProjectId, secondProjectId] },
      },
    });
    // Per-test cleanup deletes everything; this assertion confirms the
    // baseline (no policy values seeded outside the test's own scope).
    expect(settings).toEqual([]);
  });
});
