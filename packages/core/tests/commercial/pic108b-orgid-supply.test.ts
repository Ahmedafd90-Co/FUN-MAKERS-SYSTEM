/**
 * PIC-108-B (Phase MT) — commercial write-path orgId-supply, RED→GREEN on a REAL 2nd org.
 *
 * Proves each of the 8 commercial creates attributes the record to its project's
 * org (SECOND_ORG_ID), NOT the singleton @default. Pre-fix (services omit orgId)
 * every record landed orgId = singleton (org #1) — at tenant #2 that is the live
 * cross-tenant leak (org #1 sees org #2's row). Post-fix: orgId = the project's org.
 *
 * RED→GREEN: GREEN here; the RED is captured by stashing the 8 service edits and
 * re-running (records revert to the singleton) — see the PR notes.
 *
 * DB-backed (real fmksa_test_core) → runs in the CI @fmksa/core Test job (the
 * disclosure-A lesson: CI-covered runtime proof, not a local-only e2e).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  ensureSecondOrg,
  createTenantContext,
  cleanupTenantContext,
  SECOND_ORG_ID,
  type TenantContext,
} from '../helpers/second-org';
import { createIpa } from '../../src/commercial/ipa/service';
import { createIpc } from '../../src/commercial/ipc/service';
import { createVariation } from '../../src/commercial/variation/service';
import { createCostProposal } from '../../src/commercial/cost-proposal/service';
import { createTaxInvoice } from '../../src/commercial/tax-invoice/service';
import { createCorrespondence } from '../../src/commercial/correspondence/service';
import { upsertForecast } from '../../src/commercial/forecast/service';
import { createEi } from '../../src/engineer-instruction/service';

const TAG = `p108b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let ctx: TenantContext;

/** Seed a parent record at a non-default status (bypasses no-direct-status-write). */
async function withSeedContext<T>(fn: () => Promise<T>): Promise<T> {
  process.env.SEED_CONTEXT = 'true';
  try {
    return await fn();
  } finally {
    delete process.env.SEED_CONTEXT;
  }
}

beforeAll(async () => {
  await ensureSecondOrg();
  ctx = await createTenantContext(SECOND_ORG_ID, TAG);
}, 60_000);

afterAll(async () => {
  const { projectId } = ctx;
  // Append-only tables (WorkflowAction, AuditLog) reject the typed deleteMany
  // (no-delete-on-immutable middleware) — raw SQL bypasses the middleware and is
  // fine for a test-fixture teardown. The rest are transactional → typed delete.
  await prisma.$executeRawUnsafe(
    `DELETE FROM workflow_actions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE project_id = $1)`,
    projectId,
  );
  await prisma.workflowInstance.deleteMany({ where: { projectId } });
  await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE project_id = $1`, projectId);
  await prisma.taxInvoice.deleteMany({ where: { projectId } });
  await prisma.ipc.deleteMany({ where: { projectId } });
  await prisma.ipa.deleteMany({ where: { projectId } });
  await prisma.ipaForecast.deleteMany({ where: { projectId } });
  await prisma.variation.deleteMany({ where: { projectId } });
  await prisma.costProposal.deleteMany({ where: { projectId } });
  await prisma.correspondence.deleteMany({ where: { projectId } });
  await prisma.engineerInstruction.deleteMany({ where: { projectId } });
  // generateReferenceNumber (INVNUM etc.) created project-scoped counters → clear
  // them before cleanupTenantContext deletes the project (FK).
  await prisma.referenceCounter.deleteMany({ where: { projectId } });
  await cleanupTenantContext(ctx);
}, 60_000);

describe('PIC-108-B — commercial writes attribute orgId from project.orgId (real 2nd org)', () => {
  it('createIpa → orgId is org-B (not the singleton)', async () => {
    const ipa = await createIpa(
      {
        projectId: ctx.projectId,
        periodNumber: 1,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        grossAmount: 1000,
        retentionRate: 0.1,
        retentionAmount: 100,
        previousCertified: 0,
        currentClaim: 900,
        netClaimed: 900,
        currency: 'SAR',
      } as Parameters<typeof createIpa>[0],
      ctx.userId,
    );
    expect(ipa.orgId).toBe(SECOND_ORG_ID);
  });

  it('createVariation → orgId is org-B', async () => {
    const v = await createVariation(
      {
        projectId: ctx.projectId,
        subtype: 'vo',
        title: 'VO 108b',
        description: 'desc',
        reason: 'reason',
        currency: 'SAR',
      } as Parameters<typeof createVariation>[0],
      ctx.userId,
    );
    expect(v.orgId).toBe(SECOND_ORG_ID);
  });

  it('createCorrespondence → orgId is org-B', async () => {
    const c = await createCorrespondence(
      {
        projectId: ctx.projectId,
        subtype: 'notice',
        subject: 'Notice 108b',
        body: 'body',
        recipientName: 'Recipient',
      } as Parameters<typeof createCorrespondence>[0],
      ctx.userId,
    );
    expect(c.orgId).toBe(SECOND_ORG_ID);
  });

  it('createEi → orgId is org-B', async () => {
    const ei = await createEi(
      {
        projectId: ctx.projectId,
        title: 'EI 108b',
        estimatedValue: 5000,
        currency: 'SAR',
      } as Parameters<typeof createEi>[0],
      ctx.userId,
    );
    expect(ei.orgId).toBe(SECOND_ORG_ID);
  });

  it('createCostProposal → orgId is org-B', async () => {
    const cp = await createCostProposal(
      {
        projectId: ctx.projectId,
        revisionNumber: 1,
        estimatedCost: 1000,
        currency: 'SAR',
      } as Parameters<typeof createCostProposal>[0],
      ctx.userId,
    );
    expect(cp.orgId).toBe(SECOND_ORG_ID);
  });

  it('upsertForecast → orgId is org-B', async () => {
    const f = await upsertForecast(
      {
        projectId: ctx.projectId,
        periodNumber: 1,
        periodStart: new Date('2026-01-01'),
        forecastAmount: 2000,
        currency: 'SAR',
      } as Parameters<typeof upsertForecast>[0],
      ctx.userId,
    );
    expect(f.orgId).toBe(SECOND_ORG_ID);
  });

  it('createIpc → orgId is org-B (parent IPA seeded approved_internal)', async () => {
    const parentIpa = await withSeedContext(() =>
      prisma.ipa.create({
        data: {
          orgId: SECOND_ORG_ID,
          projectId: ctx.projectId,
          status: 'approved_internal',
          periodNumber: 90,
          periodFrom: new Date('2026-02-01'),
          periodTo: new Date('2026-02-28'),
          grossAmount: 1000,
          retentionRate: 0.1,
          retentionAmount: 100,
          previousCertified: 0,
          currentClaim: 900,
          netClaimed: 900,
          currency: 'SAR',
          createdBy: ctx.userId,
        },
      }),
    );
    const ipc = await createIpc(
      {
        projectId: ctx.projectId,
        ipaId: parentIpa.id,
        certifiedAmount: 900,
        retentionAmount: 100,
        netCertified: 800,
        certificationDate: '2026-03-01',
        currency: 'SAR',
      } as Parameters<typeof createIpc>[0],
      ctx.userId,
    );
    expect(ipc.orgId).toBe(SECOND_ORG_ID);
  });

  it('createTaxInvoice → orgId is org-B (parent IPC seeded signed)', async () => {
    const parentIpa = await withSeedContext(() =>
      prisma.ipa.create({
        data: {
          orgId: SECOND_ORG_ID,
          projectId: ctx.projectId,
          status: 'approved_internal',
          periodNumber: 91,
          periodFrom: new Date('2026-04-01'),
          periodTo: new Date('2026-04-30'),
          grossAmount: 1000,
          retentionRate: 0.1,
          retentionAmount: 100,
          previousCertified: 0,
          currentClaim: 900,
          netClaimed: 900,
          currency: 'SAR',
          createdBy: ctx.userId,
        },
      }),
    );
    const parentIpc = await withSeedContext(() =>
      prisma.ipc.create({
        data: {
          orgId: SECOND_ORG_ID,
          projectId: ctx.projectId,
          ipaId: parentIpa.id,
          status: 'signed',
          certifiedAmount: 900,
          retentionAmount: 100,
          netCertified: 800,
          certificationDate: new Date('2026-04-15'),
          currency: 'SAR',
          createdBy: ctx.userId,
        },
      }),
    );
    const ti = await createTaxInvoice(
      {
        projectId: ctx.projectId,
        ipcId: parentIpc.id,
        invoiceDate: '2026-05-01',
        grossAmount: 800,
        vatRate: 0.15,
        vatAmount: 120,
        totalAmount: 920,
        currency: 'SAR',
        buyerName: 'Buyer Co',
        sellerTaxId: '300000000000003',
      } as Parameters<typeof createTaxInvoice>[0],
      ctx.userId,
    );
    expect(ti.orgId).toBe(SECOND_ORG_ID);
  });
});
