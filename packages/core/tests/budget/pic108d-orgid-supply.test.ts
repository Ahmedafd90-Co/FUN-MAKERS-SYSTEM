/**
 * PIC-108-D (Phase MT) — budget + docs write-path orgId-supply, RED→GREEN on a REAL 2nd org.
 *
 * Proves each of the 4 budget/docs creates attributes the record to its project's
 * org (SECOND_ORG_ID), NOT the singleton @default. All 4 are project-scoped:
 *   - projectBudget (createBudget)               → resolveProjectOrgId
 *   - budgetAbsorptionException (recordAbsorptionException, via absorbPoCommitment
 *     no-category path) → resolveProjectOrgId
 *   - document (createDocument)                  → reuses its already-fetched project.orgId
 *   - drawing (createDrawing)                    → resolveProjectOrgId
 *
 * RED→GREEN: GREEN here; the RED is captured by stashing the 4 service edits and
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
import { createBudget } from '../../src/budget/service';
import { absorbPoCommitment } from '../../src/budget/absorption';
import { createDocument } from '../../src/documents/create';
import { createDrawing } from '../../src/documents/drawings/service';
import { createPurchaseOrder } from '../../src/procurement/purchase-order/service';

const TAG = `p108d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let ctx: TenantContext;

beforeAll(async () => {
  await ensureSecondOrg();
  ctx = await createTenantContext(SECOND_ORG_ID, TAG);
}, 60_000);

afterAll(async () => {
  const { projectId } = ctx;
  await prisma.$executeRawUnsafe(
    `DELETE FROM workflow_actions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE project_id = $1)`,
    projectId,
  );
  await prisma.workflowInstance.deleteMany({ where: { projectId } });
  await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE project_id = $1`, projectId);
  await prisma.budgetAbsorptionException.deleteMany({ where: { projectId } });
  await prisma.purchaseOrder.deleteMany({ where: { projectId } });
  await prisma.budgetLine.deleteMany({ where: { budget: { projectId } } });
  await prisma.projectBudget.deleteMany({ where: { projectId } });
  await prisma.document.deleteMany({ where: { projectId } });
  await prisma.drawing.deleteMany({ where: { projectId } });
  await prisma.referenceCounter.deleteMany({ where: { projectId } });
  await cleanupTenantContext(ctx);
}, 60_000);

describe('PIC-108-D — budget + docs writes attribute orgId from project.orgId (real 2nd org)', () => {
  it('createBudget → orgId is org-B (not the singleton)', async () => {
    const budget = await createBudget(
      { projectId: ctx.projectId, internalBaseline: 1_000_000 },
      ctx.userId,
    );
    expect(budget.orgId).toBe(SECOND_ORG_ID);
  });

  it('recordAbsorptionException (via absorbPoCommitment no-category path) → orgId is org-B', async () => {
    // A PO with no categoryId forces the no_category absorption-exception branch.
    const po = await createPurchaseOrder(
      {
        projectId: ctx.projectId,
        vendorId: ctx.vendorId,
        title: 'PO 108d (no category)',
        totalAmount: 1000,
        currency: 'SAR',
      } as Parameters<typeof createPurchaseOrder>[0],
      ctx.userId,
    );
    const result = await absorbPoCommitment(ctx.projectId, po.id, ctx.userId);
    expect(result.absorbed).toBe(false);
    if (result.absorbed) throw new Error('expected a no_category absorption exception');
    const ex = await prisma.budgetAbsorptionException.findUniqueOrThrow({
      where: { id: result.exceptionId },
    });
    expect(ex.orgId).toBe(SECOND_ORG_ID);
  });

  it('createDocument → orgId is org-B (reuses the already-fetched project.orgId)', async () => {
    const doc = await createDocument({
      projectId: ctx.projectId,
      title: 'Doc 108d',
      category: 'contract_attachment',
      createdBy: ctx.userId,
    } as Parameters<typeof createDocument>[0]);
    expect(doc.orgId).toBe(SECOND_ORG_ID);
  });

  it('createDrawing → orgId is org-B', async () => {
    const drawing = await createDrawing(
      {
        projectId: ctx.projectId,
        drawingNumber: `DWG-${TAG}`,
        title: 'Drawing 108d',
        discipline: 'architectural',
      } as Parameters<typeof createDrawing>[0],
      ctx.userId,
    );
    expect(drawing.orgId).toBe(SECOND_ORG_ID);
  });
});
