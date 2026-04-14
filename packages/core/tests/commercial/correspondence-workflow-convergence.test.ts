/**
 * Correspondence Workflow Convergence Proof Test
 *
 * Proves that the correspondence workflow integration is correct end-to-end:
 *   1.  Create correspondence draft (claim subtype)
 *   2.  Submit → auto-start claim_standard workflow via subtype-based resolution
 *   3.  Template resolved uses correct subtype prefix (claim → claim_standard)
 *   4.  Current step / current owner / SLA / history
 *   5.  Approve through all workflow steps → convergence to approved_internal
 *   6.  Return flow → returned, re-submit resumes workflow (not restart)
 *   7.  Reject flow → rejected terminal
 *   8.  Manual approval-phase actions blocked while workflow active
 *   9.  No duplicate instance on repeated submit
 *  10.  No workflow/record drift
 *  11.  Final record state correct: approved_internal → sign → issue with ref number
 *  12.  Posting behavior: CLAIM_ISSUED fires only at 'issued', NOT at workflow approval
 *  13.  Subtype-based template selection: letter → letter_standard, claim → claim_standard
 *
 * Created 2026-04-12 — Correspondence Workflow Convergence Proof Pass.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  createCorrespondence,
  transitionCorrespondence,
} from '../../src/commercial/correspondence/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';
import {
  workflowInstanceService,
  workflowStepService,
  registerConvergenceHandlers,
} from '../../src/workflow';

// ---------------------------------------------------------------------------
// Constants — roles used in claim_standard template
// ---------------------------------------------------------------------------

// claim_standard steps:
//   step(10, 'Commercial/Contracts', 'contracts_manager', 24, 'review')
//   step(20, 'Contracts Review', 'contracts_manager', 48, 'review')
//   step(30, 'PD Sign', 'project_director', 72, 'sign')
//   step(40, 'Issue', 'document_controller', 24, 'issue', true)

const ROLES_NEEDED = [
  'contracts_manager',
  'project_director',
  'document_controller',
] as const;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('Correspondence Workflow Convergence Proof', () => {
  let testProject: { id: string; code: string; entityId: string };
  const ts = Date.now();

  /** Map from role code → userId created for this test */
  const roleUsers: Record<string, string> = {};

  beforeAll(async () => {
    registerCommercialEventTypes();
    registerConvergenceHandlers();

    // Ensure correspondence templates ARE active
    await prisma.workflowTemplate.updateMany({
      where: { recordType: 'correspondence' },
      data: { isActive: true },
    });

    // Create entity + project
    const entity = await prisma.entity.create({
      data: {
        code: `ENT-CORWF-${ts}`,
        name: 'Correspondence WF Test Entity',
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
        code: `PROJ-CORWF-${ts}`,
        name: 'Correspondence Workflow Test',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    // Create users for each role and assign them to the project
    for (const roleCode of ROLES_NEEDED) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new Error(`Role '${roleCode}' not found — run seed first`);

      const user = await prisma.user.create({
        data: {
          name: `Test ${roleCode} ${ts}`,
          email: `test-${roleCode}-${ts}@corr-wf.test`,
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
    // Ensure templates stay active for other tests
    await prisma.workflowTemplate.updateMany({
      where: { recordType: 'correspondence' },
      data: { isActive: true },
    });
  });

  const makeClaimInput = (overrides = {}) => ({
    projectId: testProject.id,
    subtype: 'claim' as const,
    subject: `Test Claim ${Date.now()}`,
    body: 'Test claim correspondence body',
    recipientName: 'Test Recipient',
    recipientOrg: 'Test Org',
    currency: 'SAR',
    claimType: 'additional_cost' as const,
    claimedAmount: 75000,
    claimedTimeDays: 30,
    ...overrides,
  });

  const makeLetterInput = (overrides = {}) => ({
    projectId: testProject.id,
    subtype: 'letter' as const,
    subject: `Test Letter ${Date.now()}`,
    body: 'Test letter body',
    recipientName: 'Letter Recipient',
    currency: 'SAR',
    ...overrides,
  });

  /** Helper to approve through all steps of a workflow instance */
  async function approveAllSteps(instanceId: string) {
    const instance = await workflowInstanceService.getInstance(instanceId);
    const steps = instance.template.steps;
    for (const step of steps) {
      const current = await workflowInstanceService.getInstance(instanceId);
      if (current.status === 'approved') break;
      const approverRole = (step.approverRuleJson as { roleCode: string }).roleCode;
      await workflowStepService.approveStep({
        instanceId,
        stepId: current.currentStepId!,
        actorUserId: roleUsers[approverRole]!,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Scenario 1: Create correspondence draft
  // -------------------------------------------------------------------------

  it('Scenario 1: creates Correspondence in draft status', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);
    expect(corr.status).toBe('draft');
    expect(corr.subtype).toBe('claim');
    expect(corr.projectId).toBe(testProject.id);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Submit auto-starts claim_standard workflow
  // -------------------------------------------------------------------------

  it('Scenario 2: submit → under_review auto-starts claim_standard workflow', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);
    expect(instance).not.toBeNull();
    expect(instance!.status).toBe('in_progress');
    expect(instance!.template.code).toBe('claim_standard');
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Template resolved uses subtype prefix
  // -------------------------------------------------------------------------

  it('Scenario 3: template resolution picks claim_standard with correct 4 steps', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);
    expect(instance!.template.code).toBe('claim_standard');
    expect(instance!.template.steps.length).toBe(4);
    expect(instance!.template.steps[0]!.name).toBe('Commercial/Contracts');
    expect(instance!.template.steps[1]!.name).toBe('Contracts Review');
    expect(instance!.template.steps[2]!.name).toBe('PD Sign');
    expect(instance!.template.steps[3]!.name).toBe('Issue');
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Current step / owner / SLA / history
  // -------------------------------------------------------------------------

  it('Scenario 4: first step has correct owner, SLA, and history', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);
    expect(instance).not.toBeNull();

    // Current step is the first one
    expect(instance!.currentStep!.name).toBe('Commercial/Contracts');
    expect(instance!.currentStep!.outcomeType).toBe('review');

    // SLA info
    expect(instance!.slaInfo).not.toBeNull();
    expect(instance!.slaInfo!.currentStepSlaHours).toBe(24);
    expect(instance!.slaInfo!.isBreached).toBe(false);

    // Approver rule points to contracts_manager
    const approverRule = instance!.currentStep!.approverRuleJson as { roleCode: string };
    expect(approverRule.roleCode).toBe('contracts_manager');

    // History has 'started' action
    expect(instance!.actions.length).toBeGreaterThanOrEqual(1);
    expect(instance!.actions[0]!.action).toBe('started');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Approve through all steps → convergence to approved_internal
  // -------------------------------------------------------------------------

  it('Scenario 5: full workflow approval converges to approved_internal', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);
    const steps = instance!.template.steps;

    // Step 1: Commercial/Contracts (contracts_manager)
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.contracts_manager!,
    });

    // Step 2: Contracts Review (contracts_manager)
    let updated = await workflowInstanceService.getInstance(instance!.id);
    expect(updated.currentStep!.name).toBe('Contracts Review');
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.contracts_manager!,
    });

    // Step 3: PD Sign (project_director)
    updated = await workflowInstanceService.getInstance(instance!.id);
    expect(updated.currentStep!.name).toBe('PD Sign');
    expect(updated.currentStep!.outcomeType).toBe('sign');
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[2]!.id,
      actorUserId: roleUsers.project_director!,
    });

    // Step 4: Issue (document_controller, optional but still reached)
    updated = await workflowInstanceService.getInstance(instance!.id);
    expect(updated.currentStep!.name).toBe('Issue');
    expect(updated.currentStep!.outcomeType).toBe('issue');
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[3]!.id,
      actorUserId: roleUsers.document_controller!,
    });

    // Workflow should be approved (all steps complete)
    const final = await workflowInstanceService.getInstance(instance!.id);
    expect(final.status).toBe('approved');
    expect(final.currentStep).toBeNull();

    // Convergence: correspondence should be approved_internal
    const corrRecord = await prisma.correspondence.findUnique({ where: { id: corr.id } });
    expect(corrRecord!.status).toBe('approved_internal');
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Return flow → returned, re-submit resumes
  // -------------------------------------------------------------------------

  it('Scenario 6: return sends workflow back and converges record to returned, re-approve resumes', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);
    const steps = instance!.template.steps;

    // Approve step 1: Commercial/Contracts
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.contracts_manager!,
    });

    // Return at step 2 (no returnToStepId → goes to previous step, i.e. step 1)
    await workflowStepService.returnStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.contracts_manager!,
      comment: 'Needs revision',
    });

    // Workflow should be 'returned', back at step 1
    const returnedInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(returnedInstance.status).toBe('returned');
    expect(returnedInstance.currentStep!.name).toBe('Commercial/Contracts');

    // Convergence: correspondence should be 'returned'
    const returned = await prisma.correspondence.findUnique({ where: { id: corr.id } });
    expect(returned!.status).toBe('returned');

    // Re-approve step 1 to resume workflow (not re-submitting the record)
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.contracts_manager!,
      comment: 'Revised and resubmitted',
    });

    const resumed = await workflowInstanceService.getInstance(instance!.id);
    expect(resumed.status).toBe('in_progress');
    expect(resumed.currentStep!.name).toBe('Contracts Review');
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Reject flow → rejected terminal
  // -------------------------------------------------------------------------

  it('Scenario 7: reject at any step causes correspondence to be rejected (terminal)', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);

    // Reject at step 1
    await workflowStepService.rejectStep({
      instanceId: instance!.id,
      stepId: instance!.currentStepId!,
      actorUserId: roleUsers.contracts_manager!,
      comment: 'Not acceptable',
    });

    // Workflow should be rejected
    const rejectedInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(rejectedInstance.status).toBe('rejected');

    // Correspondence should be rejected (terminal)
    const corrRecord = await prisma.correspondence.findUnique({ where: { id: corr.id } });
    expect(corrRecord!.status).toBe('rejected');
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Manual approval-phase actions blocked while workflow active
  // -------------------------------------------------------------------------

  it('Scenario 8: manual approve/reject/return blocked when workflow is active', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    // All workflow-managed actions should be blocked
    await expect(
      transitionCorrespondence(corr.id, 'approve', roleUsers.contracts_manager!),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    await expect(
      transitionCorrespondence(corr.id, 'reject', roleUsers.contracts_manager!),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    await expect(
      transitionCorrespondence(corr.id, 'return', roleUsers.contracts_manager!),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);
  });

  // -------------------------------------------------------------------------
  // Scenario 9: No duplicate instance on repeated submit
  // -------------------------------------------------------------------------

  it('Scenario 9: resubmitting a returned correspondence does not create duplicate workflow', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);
    const steps = instance!.template.steps;

    // Approve step 1, then return at step 2
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.contracts_manager!,
    });
    await workflowStepService.returnStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.contracts_manager!,
      comment: 'Revise amounts',
    });

    // Record is returned — workflow is in 'returned' state
    const corrRecord = await prisma.correspondence.findUnique({ where: { id: corr.id } });
    expect(corrRecord!.status).toBe('returned');

    // Re-submit correspondence (returned → under_review) should succeed
    // and gracefully skip workflow start (DuplicateInstanceError)
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    const resubmitted = await prisma.correspondence.findUnique({ where: { id: corr.id } });
    expect(resubmitted!.status).toBe('under_review');

    // Only ONE workflow instance should exist (the returned one)
    const allInstances = await prisma.workflowInstance.findMany({
      where: { recordType: 'correspondence', recordId: corr.id },
    });
    expect(allInstances).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Scenario 10: No workflow/record drift
  // -------------------------------------------------------------------------

  it('Scenario 10: workflow and record status remain synchronized', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);

    // Draft — no workflow instance
    const beforeInstance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);
    expect(beforeInstance).toBeNull();

    // Submit → under_review + in_progress
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    let corrRecord = await prisma.correspondence.findUnique({ where: { id: corr.id } });
    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);
    expect(corrRecord!.status).toBe('under_review');
    expect(instance!.status).toBe('in_progress');

    // Approve all 4 steps → approved_internal + completed
    await approveAllSteps(instance!.id);

    corrRecord = await prisma.correspondence.findUnique({ where: { id: corr.id } });
    const completedInstance = await workflowInstanceService.getInstance(instance!.id);
    expect(corrRecord!.status).toBe('approved_internal');
    expect(completedInstance.status).toBe('approved');
  });

  // -------------------------------------------------------------------------
  // Scenario 11: Final state → approved_internal → sign → issue with ref number
  // -------------------------------------------------------------------------

  it('Scenario 11: post-workflow transitions work: sign → issue assigns CLM reference number', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);
    await approveAllSteps(instance!.id);

    // approved_internal → sign → issued
    await transitionCorrespondence(corr.id, 'sign', roleUsers.project_director!);
    const signed = await prisma.correspondence.findUnique({ where: { id: corr.id } });
    expect(signed!.status).toBe('signed');

    const issued = await transitionCorrespondence(corr.id, 'issue', roleUsers.document_controller!);
    expect(issued.status).toBe('issued');
    // Reference number uses CLM type code for claims
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-CLM-\\d{3}$`));
  });

  // -------------------------------------------------------------------------
  // Scenario 12: Posting behavior — CLAIM_ISSUED fires only at issued
  // -------------------------------------------------------------------------

  it('Scenario 12: CLAIM_ISSUED fires at issued, NOT at workflow approval', async () => {
    const corr = await createCorrespondence(makeClaimInput(), roleUsers.contracts_manager!);
    await transitionCorrespondence(corr.id, 'submit', roleUsers.contracts_manager!);

    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);
    await approveAllSteps(instance!.id);

    // At approved_internal — no CLAIM_ISSUED yet
    let postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'CLAIM_ISSUED' },
    });
    expect(postingEvent).toBeNull();

    // sign + issue
    await transitionCorrespondence(corr.id, 'sign', roleUsers.project_director!);
    await transitionCorrespondence(corr.id, 'issue', roleUsers.document_controller!);

    // NOW CLAIM_ISSUED should have fired
    postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'CLAIM_ISSUED' },
    });
    expect(postingEvent).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Scenario 13: Subtype-based template selection
  // -------------------------------------------------------------------------

  it('Scenario 13: letter subtype resolves to letter_standard template', async () => {
    const letter = await createCorrespondence(makeLetterInput(), roleUsers.contracts_manager!);
    await transitionCorrespondence(letter.id, 'submit', roleUsers.contracts_manager!);

    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', letter.id);
    expect(instance).not.toBeNull();
    expect(instance!.template.code).toBe('letter_standard');
    expect(instance!.template.steps.length).toBe(3);
    expect(instance!.template.steps[0]!.name).toBe('Originator');
    expect(instance!.template.steps[1]!.name).toBe('Manager/Contracts Review');
    expect(instance!.template.steps[2]!.name).toBe('Issue');
  });
});
