/**
 * I4 — Demo Project Integrity Guard
 *
 * Verifies that the stakeholder demo project seed (seedCommercialDemoData)
 * produces all the financial records needed for a credible dashboard demo.
 *
 * Strategy:
 *   - Creates a fresh test project with a unique code
 *   - Temporarily renames it to FMKSA-2026-001 (what the seed expects)
 *   - Runs the seed
 *   - Asserts all expected records exist
 *   - Cleans up cleanly (only our test data, no FK graph issues)
 *
 * If the seed drifts or breaks, these tests fail loudly in CI.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/index';
import { seedCommercialDemoData } from '../../src/seed/commercial-demo-data';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const ts = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const TEST_CODE = `FMKSA-DEMO-${ts}`;
let testProjectId: string;
let originalProjectCode: string | null = null;

beforeAll(async () => {
  const entity = await prisma.entity.create({
    data: { code: `ENT-DEMO-${ts}`, name: 'Demo Test Entity', type: 'parent', status: 'active' },
  });
  await prisma.currency.upsert({
    where: { code: 'SAR' }, update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });

  // If the real FMKSA-2026-001 exists, temporarily rename it
  const existing = await prisma.project.findFirst({ where: { code: 'FMKSA-2026-001' } });
  if (existing) {
    originalProjectCode = existing.id;
    await prisma.project.update({
      where: { id: existing.id },
      data: { code: `FMKSA-2026-001-bak-${ts}` },
    });
  }

  // Create a clean test project with the code the seed expects
  const project = await prisma.project.create({
    data: {
      code: 'FMKSA-2026-001',
      name: 'Demo Integrity Test Project',
      entityId: entity.id,
      status: 'active',
      currencyCode: 'SAR',
      startDate: new Date(),
      createdBy: 'test',
      contractValue: 25000000,
      revisedContractValue: 27500000,
    },
  });
  testProjectId = project.id;

  // Run the seed — it finds our test project by code
  await seedCommercialDemoData(prisma as any);
});

afterAll(async () => {
  // Clean up in FK-safe order (only test data — no deep FK graph)
  await prisma.invoiceCollection.deleteMany({ where: { taxInvoice: { projectId: testProjectId } } });
  await prisma.taxInvoice.deleteMany({ where: { projectId: testProjectId } });
  await prisma.ipc.deleteMany({ where: { projectId: testProjectId } });
  await prisma.ipa.deleteMany({ where: { projectId: testProjectId } });
  await prisma.variation.deleteMany({ where: { projectId: testProjectId } });
  await prisma.projectSetting.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
  await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});

  // Restore the original project's code if we renamed it
  if (originalProjectCode) {
    await prisma.project.update({
      where: { id: originalProjectCode },
      data: { code: 'FMKSA-2026-001' },
    }).catch(() => {});
  }

  // Clean up entity
  const ent = await prisma.entity.findFirst({ where: { code: `ENT-DEMO-${ts}` } });
  if (ent) await prisma.entity.delete({ where: { id: ent.id } }).catch(() => {});
});

// ---------------------------------------------------------------------------
// Integrity checks
// ---------------------------------------------------------------------------

describe('Demo Project Integrity', () => {
  it('project has contractValue set', async () => {
    const project = await prisma.project.findUnique({
      where: { id: testProjectId },
      select: { contractValue: true },
    });
    expect(project).not.toBeNull();
    expect(project!.contractValue).not.toBeNull();
    expect(Number(project!.contractValue)).toBeGreaterThan(0);
  });

  it('project has revisedContractValue set', async () => {
    const project = await prisma.project.findUnique({
      where: { id: testProjectId },
      select: { revisedContractValue: true },
    });
    expect(project).not.toBeNull();
    expect(project!.revisedContractValue).not.toBeNull();
    expect(Number(project!.revisedContractValue)).toBeGreaterThan(0);
  });

  it('has at least 2 IPAs', async () => {
    const count = await prisma.ipa.count({
      where: { projectId: testProjectId, description: 'DEMO_SEED' },
    });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('has at least 2 IPCs', async () => {
    const count = await prisma.ipc.count({
      where: { projectId: testProjectId },
    });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('has at least 2 tax invoices', async () => {
    const count = await prisma.taxInvoice.count({
      where: { projectId: testProjectId },
    });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('has at least 1 invoice collection', async () => {
    const count = await prisma.invoiceCollection.count({
      where: { taxInvoice: { projectId: testProjectId } },
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('has at least 1 overdue invoice (dueDate < now)', async () => {
    const count = await prisma.taxInvoice.count({
      where: {
        projectId: testProjectId,
        dueDate: { lt: new Date() },
      },
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('has at least 1 approved variation', async () => {
    const count = await prisma.variation.count({
      where: {
        projectId: testProjectId,
        status: 'approved_internal',
      },
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('has at least 1 submitted variation', async () => {
    const count = await prisma.variation.count({
      where: {
        projectId: testProjectId,
        status: 'submitted',
      },
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('seed is idempotent — running it again does not create duplicates', async () => {
    const countBefore = await prisma.ipa.count({
      where: { projectId: testProjectId, description: 'DEMO_SEED' },
    });

    // Run seed again
    await seedCommercialDemoData(prisma as any);

    const countAfter = await prisma.ipa.count({
      where: { projectId: testProjectId, description: 'DEMO_SEED' },
    });

    expect(countAfter).toBe(countBefore);
  });
});
