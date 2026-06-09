/**
 * PIC-108-C (Phase MT) — procurement write-path orgId-supply, RED→GREEN on a REAL 2nd org.
 *
 * Proves each of the 8 procurement creates attributes the record to its parent's
 * org (SECOND_ORG_ID), NOT the singleton @default. Project-scoped writes derive
 * from project.orgId (resolveProjectOrgId); entity-scoped writes (vendor /
 * catalog / category) derive from entity.orgId (resolveEntityOrgId). Pre-fix
 * every record landed orgId = singleton (org #1) — at tenant #2 that is the live
 * cross-tenant leak.
 *
 * RED→GREEN: GREEN here; the RED is captured by stashing the 8 service edits and
 * re-running (records revert to the singleton) — see the PR notes.
 *
 * DB-backed (real fmksa_test_core) → runs in the CI @fmksa/core Test job.
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
import { createPurchaseOrder } from '../../src/procurement/purchase-order/service';
import { createSupplierInvoice } from '../../src/procurement/supplier-invoice/service';
import { createCreditNote } from '../../src/procurement/credit-note/service';
import { createExpense } from '../../src/procurement/expense/service';
import { createVendor } from '../../src/procurement/vendor/service';
import { createCatalogItem } from '../../src/procurement/catalog/service';
import { createCategory } from '../../src/procurement/category/service';
import { materialiseAward } from '../../src/procurement/rfq/materialisation';

const TAG = `p108c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
  const { projectId, entityId } = ctx;
  // Append-only tables (WorkflowAction, AuditLog) — raw SQL bypasses the
  // no-delete-on-immutable middleware (test-fixture teardown only).
  await prisma.$executeRawUnsafe(
    `DELETE FROM workflow_actions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE project_id = $1)`,
    projectId,
  );
  await prisma.workflowInstance.deleteMany({ where: { projectId } });
  await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE project_id = $1`, projectId);
  // Project-scoped procurement records (delete before their FK parents).
  await prisma.purchaseOrder.deleteMany({ where: { projectId } });
  await prisma.supplierInvoice.deleteMany({ where: { projectId } });
  await prisma.creditNote.deleteMany({ where: { projectId } });
  await prisma.expense.deleteMany({ where: { projectId } });
  await prisma.quotation.deleteMany({ where: { rfq: { projectId } } });
  // Entity-scoped records created here.
  await prisma.itemCatalog.deleteMany({ where: { entityId } });
  await prisma.procurementCategory.deleteMany({ where: { entityId } });
  await prisma.vendor.deleteMany({ where: { entityId } });
  // PO/SI generated PO/SI reference counters → clear before project FK delete.
  await prisma.referenceCounter.deleteMany({ where: { projectId } });
  await cleanupTenantContext(ctx);
}, 60_000);

describe('PIC-108-C — procurement writes attribute orgId from the parent (real 2nd org)', () => {
  it('createPurchaseOrder → orgId is org-B (project.orgId, not the singleton)', async () => {
    const po = await createPurchaseOrder(
      {
        projectId: ctx.projectId,
        vendorId: ctx.vendorId,
        title: 'PO 108c',
        totalAmount: 1000,
        currency: 'SAR',
      } as Parameters<typeof createPurchaseOrder>[0],
      ctx.userId,
    );
    expect(po.orgId).toBe(SECOND_ORG_ID);
  });

  it('createSupplierInvoice → orgId is org-B', async () => {
    const si = await createSupplierInvoice(
      {
        projectId: ctx.projectId,
        vendorId: ctx.vendorId,
        invoiceDate: '2026-01-15',
        grossAmount: 1000,
        vatRate: 0.15,
        vatAmount: 150,
        totalAmount: 1150,
        currency: 'SAR',
      } as Parameters<typeof createSupplierInvoice>[0],
      ctx.userId,
    );
    expect(si.orgId).toBe(SECOND_ORG_ID);
  });

  it('createCreditNote → orgId is org-B', async () => {
    const cn = await createCreditNote(
      {
        projectId: ctx.projectId,
        vendorId: ctx.vendorId,
        subtype: 'credit_note',
        creditNoteNumber: `CN-${TAG}`,
        amount: 250,
        currency: 'SAR',
        reason: 'overcharge',
        receivedDate: '2026-02-01',
      } as Parameters<typeof createCreditNote>[0],
      ctx.userId,
    );
    expect(cn.orgId).toBe(SECOND_ORG_ID);
  });

  it('createExpense → orgId is org-B', async () => {
    const ex = await createExpense(
      {
        projectId: ctx.projectId,
        subtype: 'general',
        title: 'Expense 108c',
        amount: 500,
        currency: 'SAR',
        expenseDate: '2026-02-10',
      } as Parameters<typeof createExpense>[0],
      ctx.userId,
    );
    expect(ex.orgId).toBe(SECOND_ORG_ID);
  });

  it('createVendor → orgId is org-B (entity.orgId)', async () => {
    const v = await createVendor(
      {
        entityId: ctx.entityId,
        name: `Vendor 108c ${TAG}`,
      } as Parameters<typeof createVendor>[0],
      ctx.userId,
    );
    expect(v.orgId).toBe(SECOND_ORG_ID);
  });

  it('createCatalogItem → orgId is org-B (entity.orgId)', async () => {
    const item = await createCatalogItem(
      {
        entityId: ctx.entityId,
        name: `Item 108c ${TAG}`,
        unit: 'ea',
      } as Parameters<typeof createCatalogItem>[0],
      ctx.userId,
    );
    expect(item.orgId).toBe(SECOND_ORG_ID);
  });

  it('createCategory → orgId is org-B (entity.orgId)', async () => {
    const cat = await createCategory(
      {
        entityId: ctx.entityId,
        name: `Category 108c ${TAG}`,
      } as Parameters<typeof createCategory>[0],
      ctx.userId,
    );
    expect(cat.orgId).toBe(SECOND_ORG_ID);
  });

  it('materialiseAward PO (THE CANARY) → orgId is org-B (sibling vendorContract already supplied it)', async () => {
    // Seed an awarded RFQ + quotation under project-B (RFQ is workflow-managed →
    // SEED_CONTEXT to write status='awarded' directly).
    const rfq = await withSeedContext(() =>
      prisma.rFQ.create({
        data: {
          orgId: SECOND_ORG_ID,
          projectId: ctx.projectId,
          rfqNumber: `RFQ-C-${TAG}`,
          title: 'Canary RFQ 108c',
          currency: 'SAR',
          status: 'awarded',
          createdBy: ctx.userId,
        },
      }),
    );
    await withSeedContext(() =>
      prisma.quotation.create({
        data: {
          rfqId: rfq.id,
          vendorId: ctx.vendorId,
          receivedDate: new Date('2026-01-01'),
          totalAmount: 1000,
          currency: 'SAR',
          status: 'awarded',
          createdBy: ctx.userId,
        },
      }),
    );
    const result = await materialiseAward(
      { rfqId: rfq.id, projectId: ctx.projectId, materialiseAs: 'po' } as Parameters<
        typeof materialiseAward
      >[0],
      ctx.userId,
    );
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: result.recordId } });
    expect(po.orgId).toBe(SECOND_ORG_ID);
  });
});
