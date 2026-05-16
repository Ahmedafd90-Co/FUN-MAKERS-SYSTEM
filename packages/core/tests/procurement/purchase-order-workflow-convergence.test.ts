/**
 * Purchase Order Workflow Convergence Proof Test
 *
 * Proves that the PO workflow integration is correct end-to-end:
 *   1.  Create PO draft
 *   2.  Submit → auto-start po_standard workflow
 *   3.  Template resolution picks po_standard with correct 5 steps
 *   4.  Current step / approver / SLA
 *   5.  Approve through all steps → convergence to 'approved'
 *   6.  Return flow → PO 'returned', re-approve at first step resumes
 *   7.  Reject flow → PO 'rejected' (terminal)
 *   8.  Manual approve/reject/return BLOCKED while workflow is active
 *       (this is the Lane 1 enforcement check — the reason we did this work)
 *   9.  No duplicate workflow instance on repeated submit
 *
 * Created 2026-04-23 — Lane 1 PO Enforcement.
 *
 * NOTE: Budget absorption on PO approval is exercised by the budget tests,
 * not here. This test deliberately uses a project with no budget setup;
 * convergence to 'approved' still succeeds, and the absorption exception
 * is recorded as expected (see `handlePoApproved` in convergence-handlers.ts
 * for the "known limitation" note on post-approval absorption failure).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  createPurchaseOrder,
  transitionPurchaseOrder,
} from '../../src/procurement/purchase-order/service';
import {
  workflowInstanceService,
  workflowStepService,
  registerConvergenceHandlers,
} from '../../src/workflow';

// ---------------------------------------------------------------------------
// Constants — roles used in po_standard template
// ---------------------------------------------------------------------------

// po_standard steps (from procurement-workflow-templates.ts):
//   step(10, 'Procurement Prepare',          'procurement',       24)
//   step(20, 'PM Review',                    'project_manager',   48)
//   step(30, 'Procurement Manager Review',   'procurement',       48)
//   step(40, 'Finance Check',                'finance',           48)
//   step(50, 'Contracts Manager Sign',       'contracts_manager', 72)

const ROLES_NEEDED = [
  'procurement',
  'project_manager',
  'finance',
  'contracts_manager',
] as const;

// ---------------------------------------------------------------------------

describe('Purchase Order Workflow Convergence Proof', () => {
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
      where: { recordType: 'purchase_order' },
      select: { id: true, isActive: true },
    });

    // Ensure PO templates are active
    await prisma.workflowTemplate.updateMany({
      where: { recordType: 'purchase_order' },
      data: { isActive: true },
    });

    const entity = await prisma.entity.create({
      data: {
        code: `ENT-POWF-${ts}`,
        name: 'PO WF Test Entity',
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
        code: `PROJ-POWF-${ts}`,
        name: 'PO Workflow Test',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    // Vendor (entity-scoped)
    const vendor = await prisma.vendor.create({
      data: {
        entityId: entity.id,
        vendorCode: `VEN-POWF-${ts}`,
        name: `PO WF Test Vendor ${ts}`,
        status: 'active',
        createdBy: 'test-setup',
      },
    });
    testVendor = { id: vendor.id };

    // Create users for each role and assign them to the project
    for (const roleCode of ROLES_NEEDED) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new Error(`Role '${roleCode}' not found — run seed first`);

      const user = await prisma.user.create({
        data: {
          name: `Test ${roleCode} ${ts}`,
          email: `test-po-${roleCode}-${ts}@po-wf.test`,
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

  const makePoInput = (overrides = {}) => ({
    projectId: testProject.id,
    vendorId: testVendor.id,
    title: `Test PO ${Date.now()}`,
    description: 'Test PO for workflow convergence',
    totalAmount: 50000,
    currency: 'SAR',
    ...overrides,
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Create draft
  // -------------------------------------------------------------------------

  it('Scenario 1: creates PO in draft status', async () => {
    const po = await createPurchaseOrder(makePoInput(), roleUsers.procurement!);
    expect(po.status).toBe('draft');
    expect(po.projectId).toBe(testProject.id);
    expect(po.vendorId).toBe(testVendor.id);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Submit auto-starts po_standard workflow
  // -------------------------------------------------------------------------

  it('Scenario 2: submit auto-starts a po_standard workflow instance', async () => {
    const po = await createPurchaseOrder(makePoInput(), roleUsers.procurement!);
    await transitionPurchaseOrder(
      { projectId: testProject.id, id: po.id, action: 'submit' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('purchase_order', po.id);
    expect(instance).not.toBeNull();
    expect(instance!.status).toBe('in_progress');
    expect(instance!.template.code).toBe('po_standard');
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Template resolution picks po_standard with 5 steps
  // -------------------------------------------------------------------------

  it('Scenario 3: template resolution picks po_standard with correct 5 steps', async () => {
    const po = await createPurchaseOrder(makePoInput(), roleUsers.procurement!);
    await transitionPurchaseOrder(
      { projectId: testProject.id, id: po.id, action: 'submit' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('purchase_order', po.id);
    expect(instance!.template.code).toBe('po_standard');
    expect(instance!.template.steps.length).toBe(5);
    expect(instance!.template.steps[0]!.name).toBe('Procurement Prepare');
    expect(instance!.template.steps[1]!.name).toBe('PM Review');
    expect(instance!.template.steps[2]!.name).toBe('Procurement Manager Review');
    expect(instance!.template.steps[3]!.name).toBe('Finance Check');
    expect(instance!.template.steps[4]!.name).toBe('Contracts Manager Sign');
  });

  // -------------------------------------------------------------------------
  // Scenario 4: First step has correct owner and SLA
  // -------------------------------------------------------------------------

  it('Scenario 4: first step points to procurement role with 24h SLA', async () => {
    const po = await createPurchaseOrder(makePoInput(), roleUsers.procurement!);
    await transitionPurchaseOrder(
      { projectId: testProject.id, id: po.id, action: 'submit' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('purchase_order', po.id);
    expect(instance!.currentStep!.name).toBe('Procurement Prepare');
    expect(instance!.slaInfo!.currentStepSlaHours).toBe(24);

    const approverRule = instance!.currentStep!.approverRuleJson as { roleCode: string };
    expect(approverRule.roleCode).toBe('procurement');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Approving all steps → convergence to 'approved'
  // -------------------------------------------------------------------------

  it("Scenario 5: approving every step converges PO to 'approved' (Lane 1 core)", async () => {
    const po = await createPurchaseOrder(makePoInput(), roleUsers.procurement!);
    await transitionPurchaseOrder(
      { projectId: testProject.id, id: po.id, action: 'submit' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('purchase_order', po.id);
    const steps = instance!.template.steps;

    // Step 1: Procurement Prepare (procurement)
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.procurement!,
    });
    // Step 2: PM Review (project_manager)
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.project_manager!,
    });
    // Step 3: Procurement Manager Review (procurement)
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[2]!.id,
      actorUserId: roleUsers.procurement!,
    });
    // Step 4: Finance Check (finance)
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[3]!.id,
      actorUserId: roleUsers.finance!,
    });
    // Step 5: Contracts Manager Sign (contracts_manager)
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[4]!.id,
      actorUserId: roleUsers.contracts_manager!,
    });

    const finalInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(finalInstance.status).toBe('approved');
    expect(finalInstance.currentStep).toBeNull();

    // Convergence: PO must be 'approved'
    const finalPo = await prisma.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(finalPo!.status).toBe('approved');
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Return at any step → PO 'returned'; re-approve resumes
  // -------------------------------------------------------------------------

  it("Scenario 6: workflow return converges PO to 'returned'; re-approval resumes in_progress", async () => {
    const po = await createPurchaseOrder(makePoInput(), roleUsers.procurement!);
    await transitionPurchaseOrder(
      { projectId: testProject.id, id: po.id, action: 'submit' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('purchase_order', po.id);
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
      actorUserId: roleUsers.project_manager!,
      comment: 'Needs line items',
    });

    const returnedInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(returnedInstance.status).toBe('returned');
    expect(returnedInstance.currentStep!.name).toBe('Procurement Prepare');

    // PO status must also be 'returned'
    const returnedPo = await prisma.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(returnedPo!.status).toBe('returned');

    // Re-approving step 1 resumes the workflow
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.procurement!,
      comment: 'Revised',
    });

    const resumed = await workflowInstanceService.getInstance(instance!.id);
    expect(resumed.status).toBe('in_progress');
    expect(resumed.currentStep!.name).toBe('PM Review');
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Reject → PO 'rejected' (terminal)
  // -------------------------------------------------------------------------

  it("Scenario 7: workflow reject at any step converges PO to 'rejected' (terminal)", async () => {
    const po = await createPurchaseOrder(makePoInput(), roleUsers.procurement!);
    await transitionPurchaseOrder(
      { projectId: testProject.id, id: po.id, action: 'submit' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('purchase_order', po.id);

    // Reject at first step
    await workflowStepService.rejectStep({
      instanceId: instance!.id,
      stepId: instance!.currentStepId!,
      actorUserId: roleUsers.procurement!,
      comment: 'Wrong vendor',
    });

    const rejectedInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(rejectedInstance.status).toBe('rejected');

    const rejectedPo = await prisma.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(rejectedPo!.status).toBe('rejected');
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Manual approve/reject/return BLOCKED while workflow is active
  // This is the enforcement check: without this, a user with permission could
  // flip a PO to 'approved' directly and bypass every approver. That's why
  // Lane 1 exists.
  // -------------------------------------------------------------------------

  it('Scenario 8: manual approve/reject/return blocked while workflow is active (ENFORCEMENT CHECK)', async () => {
    const po = await createPurchaseOrder(makePoInput(), roleUsers.procurement!);
    await transitionPurchaseOrder(
      { projectId: testProject.id, id: po.id, action: 'submit' },
      roleUsers.procurement!,
    );

    // All three workflow-managed actions must be blocked by the service
    await expect(
      transitionPurchaseOrder(
        { projectId: testProject.id, id: po.id, action: 'approve' },
        roleUsers.contracts_manager!,
      ),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    await expect(
      transitionPurchaseOrder(
        { projectId: testProject.id, id: po.id, action: 'reject' },
        roleUsers.contracts_manager!,
      ),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    await expect(
      transitionPurchaseOrder(
        { projectId: testProject.id, id: po.id, action: 'return' },
        roleUsers.contracts_manager!,
      ),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    // PO stays 'submitted' — no bypass happened
    const stillSubmitted = await prisma.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(stillSubmitted!.status).toBe('submitted');
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Re-submitting a returned PO does not create a duplicate instance
  // -------------------------------------------------------------------------

  it('Scenario 9: re-submitting a returned PO does not create a duplicate workflow instance', async () => {
    const po = await createPurchaseOrder(makePoInput(), roleUsers.procurement!);
    await transitionPurchaseOrder(
      { projectId: testProject.id, id: po.id, action: 'submit' },
      roleUsers.procurement!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('purchase_order', po.id);
    const steps = instance!.template.steps;

    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.procurement!,
    });
    await workflowStepService.returnStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.project_manager!,
      comment: 'Fix details',
    });

    // PO is 'returned' — user can re-submit (returned → submitted)
    await transitionPurchaseOrder(
      { projectId: testProject.id, id: po.id, action: 'submit' },
      roleUsers.procurement!,
    );

    const resubmitted = await prisma.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(resubmitted!.status).toBe('submitted');

    // Only the original instance exists
    const allInstances = await prisma.workflowInstance.findMany({
      where: { recordType: 'purchase_order', recordId: po.id },
    });
    expect(allInstances).toHaveLength(1);
  });
});
