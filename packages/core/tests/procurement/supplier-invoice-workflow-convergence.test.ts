/**
 * Supplier Invoice Workflow Convergence Proof Test
 *
 * Proves that the SI workflow integration is correct end-to-end:
 *   1.  Create SI (starts at 'received')
 *   2.  Review → auto-start supplier_invoice_standard workflow; SI → under_review
 *   3.  Template resolution picks supplier_invoice_standard with correct 3 steps
 *   4.  Current step / approver / SLA
 *   5.  Approve through all steps → convergence to 'approved'
 *   6.  Return flow → SI 'disputed' (Option A: workflow return = disputed)
 *   7.  Reject flow → SI 'rejected' (terminal)
 *   8.  Manual approve/reject/dispute BLOCKED while workflow is active
 *       (this is the Lane 1 enforcement check — the reason we did this work)
 *   9.  No duplicate workflow instance on repeated review action
 *
 * Created 2026-04-23 — Lane 1 Supplier Invoice Enforcement.
 *
 * Follows the PO convergence test pattern (purchase-order-workflow-convergence.test.ts).
 *
 * NOTE: Budget absorption on SI approval is exercised by the budget tests,
 * not here. This test deliberately uses a project with no budget setup;
 * convergence to 'approved' still succeeds, and the absorption exception
 * is recorded as expected.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  createSupplierInvoice,
  transitionSupplierInvoice,
} from '../../src/procurement/supplier-invoice/service';
import {
  workflowInstanceService,
  workflowStepService,
  registerConvergenceHandlers,
} from '../../src/workflow';

// ---------------------------------------------------------------------------
// Constants — roles used in supplier_invoice_standard template
// ---------------------------------------------------------------------------

// supplier_invoice_standard steps (from procurement-workflow-templates.ts):
//   step(10, 'Procurement Verification',    'procurement', 24)
//   step(20, 'Finance Review',              'finance',     48)
//   step(30, 'Finance Manager Approval',    'finance',     48)

const ROLES_NEEDED = ['procurement', 'finance'] as const;

// ---------------------------------------------------------------------------

describe('Supplier Invoice Workflow Convergence Proof', () => {
  let testProject: { id: string; code: string; entityId: string };
  let testVendor: { id: string };
  let previousTemplateStates: Array<{ id: string; isActive: boolean }> = [];
  const ts = Date.now();

  /** Map from role code → userId created for this test */
  const roleUsers: Record<string, string> = {};

  beforeAll(async () => {
    registerConvergenceHandlers();

    // Capture current template state so afterAll can restore it.
    previousTemplateStates = await prisma.workflowTemplate.findMany({
      where: { recordType: 'supplier_invoice' },
      select: { id: true, isActive: true },
    });

    // Ensure SI templates are active
    await prisma.workflowTemplate.updateMany({
      where: { recordType: 'supplier_invoice' },
      data: { isActive: true },
    });

    const entity = await prisma.entity.create({
      data: {
        code: `ENT-SIWF-${ts}`,
        name: 'SI WF Test Entity',
        type: 'parent',
        status: 'active',
      },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' },
      update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-SIWF-${ts}`,
        name: 'SI Workflow Test',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    const vendor = await prisma.vendor.create({
      data: {
        entityId: entity.id,
        vendorCode: `VEN-SIWF-${ts}`,
        name: `SI WF Test Vendor ${ts}`,
        status: 'active',
        createdBy: 'test-setup',
      },
    });
    testVendor = { id: vendor.id };

    for (const roleCode of ROLES_NEEDED) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new Error(`Role '${roleCode}' not found — run seed first`);

      const user = await prisma.user.create({
        data: {
          name: `Test ${roleCode} ${ts}`,
          email: `test-si-${roleCode}-${ts}@si-wf.test`,
          passwordHash: 'test-hash',
          status: 'active',
        },
      });

      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          effectiveFrom: new Date('2020-01-01'),
          assignedBy: 'test-setup',
          assignedAt: new Date(),
        },
      });

      await prisma.projectAssignment.create({
        data: {
          userId: user.id,
          projectId: testProject.id,
          roleId: role.id,
          effectiveFrom: new Date('2020-01-01'),
          assignedBy: 'test-setup',
          assignedAt: new Date(),
        },
      });

      roleUsers[roleCode] = user.id;
    }
  });

  afterAll(async () => {
    // Restore original template state so other tests that intentionally
    // set templates inactive are not affected by our setup.
    await Promise.all(
      previousTemplateStates.map((template) =>
        prisma.workflowTemplate.update({
          where: { id: template.id },
          data: { isActive: template.isActive },
        }),
      ),
    );
  });

  const makeSiInput = (overrides = {}) => ({
    projectId: testProject.id,
    vendorId: testVendor.id,
    invoiceDate: new Date().toISOString(),
    grossAmount: 50000,
    vatRate: 15,
    vatAmount: 7500,
    totalAmount: 57500,
    currency: 'SAR',
    noPOReason: 'test invoice — no PO linkage required for convergence test',
    ...overrides,
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Create
  // -------------------------------------------------------------------------

  it("Scenario 1: creates SI in 'received' status", async () => {
    const si = await createSupplierInvoice(makeSiInput(), roleUsers.procurement!);
    expect(si.status).toBe('received');
    expect(si.projectId).toBe(testProject.id);
    expect(si.vendorId).toBe(testVendor.id);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: review auto-starts the workflow
  // -------------------------------------------------------------------------

  it('Scenario 2: review auto-starts a supplier_invoice_standard workflow instance', async () => {
    const si = await createSupplierInvoice(makeSiInput(), roleUsers.procurement!);
    await transitionSupplierInvoice(
      { projectId: testProject.id, id: si.id, action: 'review' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('supplier_invoice', si.id);
    expect(instance).not.toBeNull();
    expect(instance!.status).toBe('in_progress');
    expect(instance!.template.code).toBe('supplier_invoice_standard');
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Template resolution picks supplier_invoice_standard with 3 steps
  // -------------------------------------------------------------------------

  it('Scenario 3: template resolution picks supplier_invoice_standard with correct 3 steps', async () => {
    const si = await createSupplierInvoice(makeSiInput(), roleUsers.procurement!);
    await transitionSupplierInvoice(
      { projectId: testProject.id, id: si.id, action: 'review' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('supplier_invoice', si.id);
    expect(instance!.template.code).toBe('supplier_invoice_standard');
    expect(instance!.template.steps.length).toBe(3);
    expect(instance!.template.steps[0]!.name).toBe('Procurement Verification');
    expect(instance!.template.steps[1]!.name).toBe('Finance Review');
    expect(instance!.template.steps[2]!.name).toBe('Finance Manager Approval');
  });

  // -------------------------------------------------------------------------
  // Scenario 4: First step is procurement / 24h SLA
  // -------------------------------------------------------------------------

  it('Scenario 4: first step is Procurement Verification with procurement role, 24h SLA', async () => {
    const si = await createSupplierInvoice(makeSiInput(), roleUsers.procurement!);
    await transitionSupplierInvoice(
      { projectId: testProject.id, id: si.id, action: 'review' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('supplier_invoice', si.id);
    expect(instance!.currentStep!.name).toBe('Procurement Verification');
    expect(instance!.slaInfo!.currentStepSlaHours).toBe(24);

    const approverRule = instance!.currentStep!.approverRuleJson as { roleCode: string };
    expect(approverRule.roleCode).toBe('procurement');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Walking all 3 steps → convergence to 'approved'
  // -------------------------------------------------------------------------

  it("Scenario 5: approving every step converges SI to 'approved' (Lane 1 core)", async () => {
    const si = await createSupplierInvoice(makeSiInput(), roleUsers.procurement!);
    await transitionSupplierInvoice(
      { projectId: testProject.id, id: si.id, action: 'review' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('supplier_invoice', si.id);
    const steps = instance!.template.steps;

    // Step 1: Procurement Verification (procurement)
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.procurement!,
    });
    // Step 2: Finance Review (finance)
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.finance!,
    });
    // Step 3: Finance Manager Approval (finance role reused)
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[2]!.id,
      actorUserId: roleUsers.finance!,
    });

    const finalInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(finalInstance.status).toBe('approved');
    expect(finalInstance.currentStep).toBeNull();

    // Convergence: SI must be 'approved'
    const finalSi = await prisma.supplierInvoice.findUnique({ where: { id: si.id } });
    expect(finalSi!.status).toBe('approved');
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Return at any step → SI 'disputed' (Option A)
  // -------------------------------------------------------------------------

  it("Scenario 6: workflow return converges SI to 'disputed' (Option A); re-approval resumes in_progress", async () => {
    const si = await createSupplierInvoice(makeSiInput(), roleUsers.procurement!);
    await transitionSupplierInvoice(
      { projectId: testProject.id, id: si.id, action: 'review' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('supplier_invoice', si.id);
    const steps = instance!.template.steps;

    // Approve step 1
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.procurement!,
    });

    // Return at step 2 → workflow goes back to step 1
    await workflowStepService.returnStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.finance!,
      comment: 'Amounts do not match PO',
    });

    const returnedInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(returnedInstance.status).toBe('returned');
    expect(returnedInstance.currentStep!.name).toBe('Procurement Verification');

    // SI status must be 'disputed' (Option A — reuses existing disputed state)
    const disputedSi = await prisma.supplierInvoice.findUnique({ where: { id: si.id } });
    expect(disputedSi!.status).toBe('disputed');

    // Re-approving step 1 resumes the workflow
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.procurement!,
      comment: 'Amount verified',
    });

    const resumed = await workflowInstanceService.getInstance(instance!.id);
    expect(resumed.status).toBe('in_progress');
    expect(resumed.currentStep!.name).toBe('Finance Review');
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Reject → SI 'rejected' (terminal)
  // -------------------------------------------------------------------------

  it("Scenario 7: workflow reject at any step converges SI to 'rejected' (terminal)", async () => {
    const si = await createSupplierInvoice(makeSiInput(), roleUsers.procurement!);
    await transitionSupplierInvoice(
      { projectId: testProject.id, id: si.id, action: 'review' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('supplier_invoice', si.id);

    // Reject at first step
    await workflowStepService.rejectStep({
      instanceId: instance!.id,
      stepId: instance!.currentStepId!,
      actorUserId: roleUsers.procurement!,
      comment: 'Vendor not approved',
    });

    const rejectedInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(rejectedInstance.status).toBe('rejected');

    const rejectedSi = await prisma.supplierInvoice.findUnique({ where: { id: si.id } });
    expect(rejectedSi!.status).toBe('rejected');
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Manual approve/reject/dispute BLOCKED while workflow is active
  // This is the enforcement check: without this, a user with permission could
  // flip an SI to 'approved' directly and bypass every approver. That's why
  // Lane 1 SI exists.
  // -------------------------------------------------------------------------

  it('Scenario 8: manual approve/reject/dispute blocked while workflow is active (ENFORCEMENT CHECK)', async () => {
    const si = await createSupplierInvoice(makeSiInput(), roleUsers.procurement!);
    await transitionSupplierInvoice(
      { projectId: testProject.id, id: si.id, action: 'review' },
      roleUsers.procurement!,
    );

    // All three workflow-managed actions must be blocked by the service
    await expect(
      transitionSupplierInvoice(
        { projectId: testProject.id, id: si.id, action: 'approve' },
        roleUsers.finance!,
      ),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    await expect(
      transitionSupplierInvoice(
        { projectId: testProject.id, id: si.id, action: 'reject' },
        roleUsers.finance!,
      ),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    await expect(
      transitionSupplierInvoice(
        { projectId: testProject.id, id: si.id, action: 'dispute' },
        roleUsers.finance!,
      ),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    // SI stays 'under_review' — no bypass happened
    const stillUnderReview = await prisma.supplierInvoice.findUnique({ where: { id: si.id } });
    expect(stillUnderReview!.status).toBe('under_review');
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Re-triggering review on a disputed SI does not create a duplicate instance
  // -------------------------------------------------------------------------

  it('Scenario 9: re-reviewing a disputed SI does not create a duplicate workflow instance', async () => {
    const si = await createSupplierInvoice(makeSiInput(), roleUsers.procurement!);
    await transitionSupplierInvoice(
      { projectId: testProject.id, id: si.id, action: 'review' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('supplier_invoice', si.id);
    const steps = instance!.template.steps;

    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.procurement!,
    });
    await workflowStepService.returnStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.finance!,
      comment: 'Fix details',
    });

    // SI is 'disputed' — user can re-trigger review (disputed → under_review)
    await transitionSupplierInvoice(
      { projectId: testProject.id, id: si.id, action: 'review' },
      roleUsers.procurement!,
    );

    const reReviewed = await prisma.supplierInvoice.findUnique({ where: { id: si.id } });
    expect(reReviewed!.status).toBe('under_review');

    // Only the original instance exists
    const allInstances = await prisma.workflowInstance.findMany({
      where: { recordType: 'supplier_invoice', recordId: si.id },
    });
    expect(allInstances).toHaveLength(1);
  });
});
