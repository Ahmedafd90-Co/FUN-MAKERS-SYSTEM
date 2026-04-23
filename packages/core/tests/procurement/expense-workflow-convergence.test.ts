/**
 * Expense Workflow Convergence Proof Test
 *
 * Proves that the Expense workflow integration is correct end-to-end:
 *   1.  Create Expense (starts at 'draft')
 *   2.  Submit → auto-start expense_standard workflow; Expense → submitted
 *   3.  Template resolution picks expense_standard with correct 3 steps
 *   4.  Current step / approver / SLA
 *   5.  Approve through all steps → convergence to 'approved'
 *   6.  Return flow → Expense 'returned'; re-submit resumes workflow
 *   7.  Reject flow → Expense 'rejected' (terminal)
 *   8.  Manual approve/reject/return BLOCKED while workflow is active
 *       (this is the Lane 1 enforcement check — the reason we did this work)
 *   9.  No duplicate workflow instance on re-submit of a returned expense
 *
 * Created 2026-04-23 — Lane 1 Expense Enforcement.
 *
 * Follows the PO / SI convergence test pattern.
 *
 * NOTE: Budget absorption on Expense approval is exercised by the budget
 * tests, not here. This test deliberately uses a project with no budget
 * setup; convergence to 'approved' still succeeds, and the absorption
 * exception is recorded as expected.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  createExpense,
  transitionExpense,
} from '../../src/procurement/expense/service';
import {
  workflowInstanceService,
  workflowStepService,
  registerConvergenceHandlers,
} from '../../src/workflow';

// ---------------------------------------------------------------------------
// Constants — roles used in expense_standard template
// ---------------------------------------------------------------------------
// expense_standard steps (from procurement-workflow-templates.ts):
//   step(10, 'PM Review',         'project_manager', 48)
//   step(20, 'Finance Review',    'finance',         48)
//   step(30, 'Finance Approval',  'finance',         48)

const ROLES_NEEDED = ['project_manager', 'finance'] as const;

// ---------------------------------------------------------------------------

describe('Expense Workflow Convergence Proof', () => {
  let testProject: { id: string; code: string; entityId: string };
  const ts = Date.now();

  const roleUsers: Record<string, string> = {};

  beforeAll(async () => {
    registerConvergenceHandlers();

    await prisma.workflowTemplate.updateMany({
      where: { recordType: 'expense' },
      data: { isActive: true },
    });

    const entity = await prisma.entity.create({
      data: {
        code: `ENT-EXPWF-${ts}`,
        name: 'Expense WF Test Entity',
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
        code: `PROJ-EXPWF-${ts}`,
        name: 'Expense Workflow Test',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    for (const roleCode of ROLES_NEEDED) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new Error(`Role '${roleCode}' not found — run seed first`);

      const user = await prisma.user.create({
        data: {
          name: `Test ${roleCode} ${ts}`,
          email: `test-expense-${roleCode}-${ts}@expense-wf.test`,
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
    await prisma.workflowTemplate.updateMany({
      where: { recordType: 'expense' },
      data: { isActive: true },
    });
  });

  const makeExpenseInput = (overrides = {}) => ({
    projectId: testProject.id,
    subtype: 'general' as const,
    title: `Test Expense ${Date.now()}`,
    description: 'Test expense for workflow convergence',
    amount: 5000,
    currency: 'SAR',
    expenseDate: new Date().toISOString(),
    ...overrides,
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Create draft
  // -------------------------------------------------------------------------

  it("Scenario 1: creates Expense in 'draft' status", async () => {
    const expense = await createExpense(makeExpenseInput(), roleUsers.project_manager!);
    expect(expense.status).toBe('draft');
    expect(expense.projectId).toBe(testProject.id);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Submit auto-starts expense_standard workflow
  // -------------------------------------------------------------------------

  it('Scenario 2: submit auto-starts an expense_standard workflow instance', async () => {
    const expense = await createExpense(makeExpenseInput(), roleUsers.project_manager!);
    await transitionExpense(
      { projectId: testProject.id, id: expense.id, action: 'submit' },
      roleUsers.project_manager!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('expense', expense.id);
    expect(instance).not.toBeNull();
    expect(instance!.status).toBe('in_progress');
    expect(instance!.template.code).toBe('expense_standard');
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Template resolution — 3 steps, correct names
  // -------------------------------------------------------------------------

  it('Scenario 3: template resolution picks expense_standard with correct 3 steps', async () => {
    const expense = await createExpense(makeExpenseInput(), roleUsers.project_manager!);
    await transitionExpense(
      { projectId: testProject.id, id: expense.id, action: 'submit' },
      roleUsers.project_manager!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('expense', expense.id);
    expect(instance!.template.code).toBe('expense_standard');
    expect(instance!.template.steps.length).toBe(3);
    expect(instance!.template.steps[0]!.name).toBe('PM Review');
    expect(instance!.template.steps[1]!.name).toBe('Finance Review');
    expect(instance!.template.steps[2]!.name).toBe('Finance Approval');
  });

  // -------------------------------------------------------------------------
  // Scenario 4: First step is project_manager / 48h SLA
  // -------------------------------------------------------------------------

  it('Scenario 4: first step is PM Review with project_manager role, 48h SLA', async () => {
    const expense = await createExpense(makeExpenseInput(), roleUsers.project_manager!);
    await transitionExpense(
      { projectId: testProject.id, id: expense.id, action: 'submit' },
      roleUsers.project_manager!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('expense', expense.id);
    expect(instance!.currentStep!.name).toBe('PM Review');
    expect(instance!.slaInfo!.currentStepSlaHours).toBe(48);

    const approverRule = instance!.currentStep!.approverRuleJson as { roleCode: string };
    expect(approverRule.roleCode).toBe('project_manager');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Approving all 3 steps → convergence to 'approved'
  // -------------------------------------------------------------------------

  it("Scenario 5: approving every step converges Expense to 'approved' (Lane 1 core)", async () => {
    const expense = await createExpense(makeExpenseInput(), roleUsers.project_manager!);
    await transitionExpense(
      { projectId: testProject.id, id: expense.id, action: 'submit' },
      roleUsers.project_manager!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('expense', expense.id);
    const steps = instance!.template.steps;

    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.project_manager!,
    });
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.finance!,
    });
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[2]!.id,
      actorUserId: roleUsers.finance!,
    });

    const finalInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(finalInstance.status).toBe('approved');
    expect(finalInstance.currentStep).toBeNull();

    const finalExpense = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(finalExpense!.status).toBe('approved');
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Return → Expense 'returned'; re-submit resumes
  // -------------------------------------------------------------------------

  it("Scenario 6: workflow return converges Expense to 'returned'; re-approval resumes in_progress", async () => {
    const expense = await createExpense(makeExpenseInput(), roleUsers.project_manager!);
    await transitionExpense(
      { projectId: testProject.id, id: expense.id, action: 'submit' },
      roleUsers.project_manager!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('expense', expense.id);
    const steps = instance!.template.steps;

    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.project_manager!,
    });

    await workflowStepService.returnStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.finance!,
      comment: 'Missing receipt',
    });

    const returnedInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(returnedInstance.status).toBe('returned');
    expect(returnedInstance.currentStep!.name).toBe('PM Review');

    const returnedExpense = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(returnedExpense!.status).toBe('returned');

    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.project_manager!,
      comment: 'Receipt attached',
    });

    const resumed = await workflowInstanceService.getInstance(instance!.id);
    expect(resumed.status).toBe('in_progress');
    expect(resumed.currentStep!.name).toBe('Finance Review');
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Reject → Expense 'rejected' (terminal)
  // -------------------------------------------------------------------------

  it("Scenario 7: workflow reject at any step converges Expense to 'rejected' (terminal)", async () => {
    const expense = await createExpense(makeExpenseInput(), roleUsers.project_manager!);
    await transitionExpense(
      { projectId: testProject.id, id: expense.id, action: 'submit' },
      roleUsers.project_manager!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('expense', expense.id);

    await workflowStepService.rejectStep({
      instanceId: instance!.id,
      stepId: instance!.currentStepId!,
      actorUserId: roleUsers.project_manager!,
      comment: 'Not a valid business expense',
    });

    const rejectedInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(rejectedInstance.status).toBe('rejected');

    const rejectedExpense = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(rejectedExpense!.status).toBe('rejected');
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Manual approve/reject/return BLOCKED while workflow is active
  // This is the enforcement check: without this, a user with permission could
  // flip an Expense to 'approved' directly and bypass every approver.
  // -------------------------------------------------------------------------

  it('Scenario 8: manual approve/reject/return blocked while workflow is active (ENFORCEMENT CHECK)', async () => {
    const expense = await createExpense(makeExpenseInput(), roleUsers.project_manager!);
    await transitionExpense(
      { projectId: testProject.id, id: expense.id, action: 'submit' },
      roleUsers.project_manager!,
    );

    await expect(
      transitionExpense(
        { projectId: testProject.id, id: expense.id, action: 'approve' },
        roleUsers.finance!,
      ),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    await expect(
      transitionExpense(
        { projectId: testProject.id, id: expense.id, action: 'reject' },
        roleUsers.finance!,
      ),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    await expect(
      transitionExpense(
        { projectId: testProject.id, id: expense.id, action: 'return' },
        roleUsers.finance!,
      ),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    const stillSubmitted = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(stillSubmitted!.status).toBe('submitted');
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Re-submitting a returned Expense does not create a duplicate instance
  // -------------------------------------------------------------------------

  it('Scenario 9: re-submitting a returned Expense does not create a duplicate workflow instance', async () => {
    const expense = await createExpense(makeExpenseInput(), roleUsers.project_manager!);
    await transitionExpense(
      { projectId: testProject.id, id: expense.id, action: 'submit' },
      roleUsers.project_manager!,
    );

    const instance = await workflowInstanceService.getInstanceByRecord('expense', expense.id);
    const steps = instance!.template.steps;

    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.project_manager!,
    });
    await workflowStepService.returnStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.finance!,
      comment: 'Fix details',
    });

    await transitionExpense(
      { projectId: testProject.id, id: expense.id, action: 'submit' },
      roleUsers.project_manager!,
    );

    const resubmitted = await prisma.expense.findUnique({ where: { id: expense.id } });
    expect(resubmitted!.status).toBe('submitted');

    const allInstances = await prisma.workflowInstance.findMany({
      where: { recordType: 'expense', recordId: expense.id },
    });
    expect(allInstances).toHaveLength(1);
  });
});
