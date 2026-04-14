/**
 * IPC Workflow Convergence Proof Test
 *
 * Proves that the IPC workflow integration is correct end-to-end:
 *   1. create IPC draft
 *   2. submit IPC → auto-start ipc_standard workflow
 *   3. verify template resolution
 *   4. verify current step / current owner / SLA / history
 *   5. approve through all workflow steps
 *   6. return flow
 *   7. reject flow
 *   8. manual approval-phase actions blocked while workflow active
 *   9. no duplicate instance on repeated submit
 *  10. no workflow/record drift
 *  11. final record state is correct after workflow completion
 *  12. sign / issue semantics remain clear after workflow-managed approval
 *  13. posting behavior at correct stage only
 *
 * Created 2026-04-12 — IPC Convergence Proof Pass.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { createIpc, transitionIpc } from '../../src/commercial/ipc/service';
import { createIpa, transitionIpa } from '../../src/commercial/ipa/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';
import { workflowInstanceService, workflowStepService, registerConvergenceHandlers } from '../../src/workflow';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLES_NEEDED = [
  'qs_commercial',
  'project_manager',
  'contracts_manager',
  'finance',
  'project_director',
  'document_controller',
] as const;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('IPC Workflow Convergence Proof', () => {
  let testProject: { id: string; code: string; entityId: string };
  let approvedIpa: { id: string };
  const ts = Date.now();

  /** Map from role code → userId created for this test */
  const roleUsers: Record<string, string> = {};

  /** IDs of IPA templates deactivated (IPA needs manual path for setup) */
  const deactivatedIpaTemplateIds: string[] = [];

  beforeAll(async () => {
    registerCommercialEventTypes();
    registerConvergenceHandlers();

    // Deactivate IPA templates so parent IPA can be manually approved
    const ipaTemplates = await prisma.workflowTemplate.findMany({
      where: { recordType: 'ipa', isActive: true },
    });
    for (const t of ipaTemplates) {
      await prisma.workflowTemplate.update({ where: { id: t.id }, data: { isActive: false } });
      deactivatedIpaTemplateIds.push(t.id);
    }

    // Ensure IPC templates ARE active (they should be by default)
    await prisma.workflowTemplate.updateMany({
      where: { recordType: 'ipc' },
      data: { isActive: true },
    });

    // Create entity + project
    const entity = await prisma.entity.create({
      data: { code: `ENT-IPCWF-${ts}`, name: 'IPC Workflow Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-IPCWF-${ts}`, name: 'IPC Workflow Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    // Create users for each role and assign them to the project with their roles
    for (const roleCode of ROLES_NEEDED) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new Error(`Role '${roleCode}' not found — run seed first`);

      const user = await prisma.user.create({
        data: {
          name: `Test ${roleCode} ${ts}`,
          email: `test-${roleCode}-${ts}@ipc-wf.test`,
          passwordHash: 'test-hash',
          status: 'active',
        },
      });

      // Assign role to user
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          effectiveFrom: new Date('2020-01-01'),
          assignedBy: 'test-setup',
          assignedAt: new Date(),
        },
      });

      // Assign user to project with role
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

    // Create an IPA and manually transition to approved_internal
    const ipa = await createIpa({
      projectId: testProject.id,
      periodNumber: 1,
      periodFrom: new Date().toISOString(),
      periodTo: new Date().toISOString(),
      grossAmount: 200000,
      retentionRate: 0.1,
      retentionAmount: 20000,
      previousCertified: 0,
      currentClaim: 180000,
      netClaimed: 180000,
      currency: 'SAR',
    }, roleUsers.qs_commercial!);

    await transitionIpa(ipa.id, 'submit', roleUsers.qs_commercial!);
    await transitionIpa(ipa.id, 'review', roleUsers.qs_commercial!);
    await transitionIpa(ipa.id, 'approve', roleUsers.qs_commercial!);
    approvedIpa = { id: ipa.id };
  });

  afterAll(async () => {
    // Reactivate IPA templates
    for (const id of deactivatedIpaTemplateIds) {
      await prisma.workflowTemplate.update({ where: { id }, data: { isActive: true } });
    }
  });

  const makeIpcInput = (overrides = {}) => ({
    projectId: testProject.id,
    ipaId: approvedIpa.id,
    certifiedAmount: 80000,
    retentionAmount: 8000,
    netCertified: 72000,
    certificationDate: new Date().toISOString(),
    currency: 'SAR',
    ...overrides,
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Create IPC draft
  // -------------------------------------------------------------------------

  it('Scenario 1: creates IPC in draft status', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    expect(ipc.status).toBe('draft');
    expect(ipc.projectId).toBe(testProject.id);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Submit IPC → auto-start workflow
  // -------------------------------------------------------------------------

  it('Scenario 2: submitting IPC auto-starts ipc_standard workflow', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    const reloaded = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(reloaded.status).toBe('submitted');

    const instance = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    expect(instance).not.toBeNull();
    expect(instance!.status).toBe('in_progress');
    expect(instance!.template.code).toBe('ipc_standard');
    expect(instance!.recordType).toBe('ipc');
    expect(instance!.recordId).toBe(ipc.id);
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Verify template resolution
  // -------------------------------------------------------------------------

  it('Scenario 3: ipc_standard template resolved with 6 steps', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    const instance = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    expect(instance!.template.code).toBe('ipc_standard');
    expect(instance!.template.steps).toHaveLength(6);
    expect(instance!.template.steps.map(s => s.name)).toEqual([
      'QS/Commercial Prepare',
      'PM Review',
      'Contracts Manager Review',
      'Finance Check',
      'PD Sign',
      'Issue',
    ]);
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Current step / owner / SLA / history
  // -------------------------------------------------------------------------

  it('Scenario 4: first step has correct owner, SLA, and history', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    const instance = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    expect(instance).not.toBeNull();

    // Current step is the first one
    expect(instance!.currentStep!.name).toBe('QS/Commercial Prepare');
    expect(instance!.currentStep!.outcomeType).toBe('review');

    // SLA info
    expect(instance!.slaInfo).not.toBeNull();
    expect(instance!.slaInfo!.currentStepSlaHours).toBe(24);
    expect(instance!.slaInfo!.isBreached).toBe(false);

    // History has 'started' action
    expect(instance!.actions.length).toBeGreaterThanOrEqual(1);
    expect(instance!.actions[0]!.action).toBe('started');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Full workflow approval → convergence
  // -------------------------------------------------------------------------

  it('Scenario 5: approve through all 6 steps, record converges to approved_internal', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    const instance = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    const steps = instance!.template.steps;

    // Step 1: QS/Commercial Prepare (qs_commercial)
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.qs_commercial!,
      comment: 'IPC prepared',
    });

    // Step 2: PM Review (project_manager)
    let updated = await workflowInstanceService.getInstance(instance!.id);
    expect(updated.currentStep!.name).toBe('PM Review');
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.project_manager!,
      comment: 'PM approved',
    });

    // Step 3: Contracts Manager Review (contracts_manager)
    updated = await workflowInstanceService.getInstance(instance!.id);
    expect(updated.currentStep!.name).toBe('Contracts Manager Review');
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[2]!.id,
      actorUserId: roleUsers.contracts_manager!,
      comment: 'Contracts approved',
    });

    // Step 4: Finance Check (finance)
    updated = await workflowInstanceService.getInstance(instance!.id);
    expect(updated.currentStep!.name).toBe('Finance Check');
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[3]!.id,
      actorUserId: roleUsers.finance!,
      comment: 'Finance checked',
    });

    // Step 5: PD Sign (project_director) — outcomeType: sign
    updated = await workflowInstanceService.getInstance(instance!.id);
    expect(updated.currentStep!.name).toBe('PD Sign');
    expect(updated.currentStep!.outcomeType).toBe('sign');
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[4]!.id,
      actorUserId: roleUsers.project_director!,
      comment: 'PD signed off',
    });

    // Step 6: Issue (document_controller) — optional, outcomeType: issue
    updated = await workflowInstanceService.getInstance(instance!.id);
    expect(updated.currentStep!.name).toBe('Issue');
    expect(updated.currentStep!.outcomeType).toBe('issue');
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[5]!.id,
      actorUserId: roleUsers.document_controller!,
      comment: 'Issued',
    });

    // Workflow should be approved (all steps complete)
    const final = await workflowInstanceService.getInstance(instance!.id);
    expect(final.status).toBe('approved');
    expect(final.currentStep).toBeNull();

    // Convergence: IPC record should be approved_internal
    const ipcRecord = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(ipcRecord.status).toBe('approved_internal');

    // Verify audit log has convergence entry
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'ipc',
        resourceId: ipc.id,
        action: 'ipc.transition.workflow_approved',
      },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry!.actorSource).toBe('system');
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Return flow
  // -------------------------------------------------------------------------

  it('Scenario 6: return sends workflow back and converges record to returned', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    const instance = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    const steps = instance!.template.steps;

    // Approve step 1
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.qs_commercial!,
    });

    // PM returns at step 2
    await workflowStepService.returnStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.project_manager!,
      comment: 'Needs revision on certified amounts',
    });

    // Workflow should be 'returned', back at step 1
    const returned = await workflowInstanceService.getInstance(instance!.id);
    expect(returned.status).toBe('returned');
    expect(returned.currentStep!.name).toBe('QS/Commercial Prepare');

    // Convergence: IPC record should be 'returned'
    const ipcRecord = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(ipcRecord.status).toBe('returned');

    // Can re-approve from step 1 to continue
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.qs_commercial!,
      comment: 'Revised and resubmitted',
    });

    const resumed = await workflowInstanceService.getInstance(instance!.id);
    expect(resumed.status).toBe('in_progress');
    expect(resumed.currentStep!.name).toBe('PM Review');
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Reject flow
  // -------------------------------------------------------------------------

  it('Scenario 7: reject terminates workflow and converges record to rejected', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    const instance = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    const steps = instance!.template.steps;

    // Approve step 1
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.qs_commercial!,
    });

    // PM rejects at step 2
    await workflowStepService.rejectStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.project_manager!,
      comment: 'IPC fundamentally flawed — reject',
    });

    // Workflow should be 'rejected'
    const rejected = await workflowInstanceService.getInstance(instance!.id);
    expect(rejected.status).toBe('rejected');

    // Convergence: IPC record should be 'rejected'
    const ipcRecord = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(ipcRecord.status).toBe('rejected');
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Manual approval-phase actions blocked when workflow active
  // -------------------------------------------------------------------------

  it('Scenario 8: manual approval-phase actions blocked when workflow is active', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    // Workflow is now active. From 'submitted' status:
    // - review (→ under_review): valid transition → blocked by WORKFLOW GUARD
    // - reject (→ rejected): valid transition → blocked by WORKFLOW GUARD
    // - return (→ returned): valid transition → blocked by WORKFLOW GUARD
    // - approve (→ approved_internal): INVALID transition from submitted → blocked by TRANSITION MAP
    // Both layers ensure no manual bypass is possible.

    await expect(
      transitionIpc(ipc.id, 'review', roleUsers.qs_commercial!),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    await expect(
      transitionIpc(ipc.id, 'reject', roleUsers.qs_commercial!),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    await expect(
      transitionIpc(ipc.id, 'return', roleUsers.qs_commercial!),
    ).rejects.toThrow(/approval phase is managed by workflow instance/);

    // approve is blocked by the transition map (submitted → approved_internal not valid)
    await expect(
      transitionIpc(ipc.id, 'approve', roleUsers.qs_commercial!),
    ).rejects.toThrow(/Invalid IPC transition/);
  });

  // -------------------------------------------------------------------------
  // Scenario 9: No duplicate instance on repeated submit
  // -------------------------------------------------------------------------

  it('Scenario 9: resubmitting a returned IPC does not create duplicate workflow', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    const instance = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    const steps = instance!.template.steps;

    // Approve step 1, then PM returns at step 2
    await workflowStepService.approveStep({
      instanceId: instance!.id,
      stepId: steps[0]!.id,
      actorUserId: roleUsers.qs_commercial!,
    });
    await workflowStepService.returnStep({
      instanceId: instance!.id,
      stepId: steps[1]!.id,
      actorUserId: roleUsers.project_manager!,
      comment: 'Revise amounts',
    });

    // Record is returned — but workflow instance is still in 'returned' state
    // If the IPC service tries to re-submit (returned → submitted transition),
    // it should hit DuplicateInstanceError and log a warning, not crash
    const ipcRecord = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(ipcRecord.status).toBe('returned');

    // Transition returned → submitted should succeed (graceful skip of workflow start)
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    const resubmitted = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(resubmitted.status).toBe('submitted');

    // Only ONE workflow instance should exist (the returned one)
    const allInstances = await prisma.workflowInstance.findMany({
      where: { recordType: 'ipc', recordId: ipc.id },
    });
    expect(allInstances).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Scenario 10: No workflow/record drift
  // -------------------------------------------------------------------------

  it('Scenario 10: workflow and record status stay synchronized throughout lifecycle', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);

    // Draft — no workflow
    let ipcRecord = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(ipcRecord.status).toBe('draft');
    let wf = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    expect(wf).toBeNull();

    // Submit → workflow starts
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);
    ipcRecord = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(ipcRecord.status).toBe('submitted');
    wf = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    expect(wf!.status).toBe('in_progress');

    // Approve all 6 steps → converge to approved_internal
    const steps = wf!.template.steps;
    const roleOrder = [
      roleUsers.qs_commercial!,
      roleUsers.project_manager!,
      roleUsers.contracts_manager!,
      roleUsers.finance!,
      roleUsers.project_director!,
      roleUsers.document_controller!,
    ];
    for (let i = 0; i < steps.length; i++) {
      await workflowStepService.approveStep({
        instanceId: wf!.id,
        stepId: steps[i]!.id,
        actorUserId: roleOrder[i]!,
      });
    }

    // Both synchronized at approved_internal / approved
    ipcRecord = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(ipcRecord.status).toBe('approved_internal');
    wf = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    expect(wf!.status).toBe('approved');
  });

  // -------------------------------------------------------------------------
  // Scenario 11: Final record state after workflow completion
  // -------------------------------------------------------------------------

  it('Scenario 11: final record state is approved_internal after workflow approval', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    const wf = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    const steps = wf!.template.steps;
    const roleOrder = [
      roleUsers.qs_commercial!,
      roleUsers.project_manager!,
      roleUsers.contracts_manager!,
      roleUsers.finance!,
      roleUsers.project_director!,
      roleUsers.document_controller!,
    ];
    for (let i = 0; i < steps.length; i++) {
      await workflowStepService.approveStep({
        instanceId: wf!.id,
        stepId: steps[i]!.id,
        actorUserId: roleOrder[i]!,
      });
    }

    const ipcRecord = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(ipcRecord.status).toBe('approved_internal');

    // Workflow guard should no longer block manual transitions
    // because workflow status is 'approved' (not 'in_progress' or 'returned')
    // So sign and issue should work as direct transitions
    const signed = await transitionIpc(ipc.id, 'sign', roleUsers.project_director!);
    expect(signed.status).toBe('signed');

    const issued = await transitionIpc(ipc.id, 'issue', roleUsers.document_controller!);
    expect(issued.status).toBe('issued');
    expect(issued.referenceNumber).toBeTruthy();
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-IPC-\\d{3}$`));
  });

  // -------------------------------------------------------------------------
  // Scenario 12: Sign / Issue semantics clear after workflow approval
  // -------------------------------------------------------------------------

  it('Scenario 12: approved_internal → signed → issued is clear and unambiguous', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    // Complete workflow
    const wf = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    const steps = wf!.template.steps;
    const roleOrder = [
      roleUsers.qs_commercial!,
      roleUsers.project_manager!,
      roleUsers.contracts_manager!,
      roleUsers.finance!,
      roleUsers.project_director!,
      roleUsers.document_controller!,
    ];
    for (let i = 0; i < steps.length; i++) {
      await workflowStepService.approveStep({
        instanceId: wf!.id,
        stepId: steps[i]!.id,
        actorUserId: roleOrder[i]!,
      });
    }

    // Status: approved_internal (workflow done, not yet manually signed)
    let ipcRecord = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(ipcRecord.status).toBe('approved_internal');

    // Sign: this is a separate manual action (PD physical signature)
    await transitionIpc(ipc.id, 'sign', roleUsers.project_director!);
    ipcRecord = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(ipcRecord.status).toBe('signed');

    // Issue: document controller issues the final certificate
    await transitionIpc(ipc.id, 'issue', roleUsers.document_controller!);
    ipcRecord = await prisma.ipc.findUniqueOrThrow({ where: { id: ipc.id } });
    expect(ipcRecord.status).toBe('issued');

    // Semantic clarity:
    // approved_internal = "all reviews done, ready for physical signing"
    // signed = "PD has physically signed, posting event fires, ready for issuance"
    // issued = "formally issued with reference number, end of lifecycle"
  });

  // -------------------------------------------------------------------------
  // Scenario 13: Posting at correct stage only
  // -------------------------------------------------------------------------

  it('Scenario 13: IPC_SIGNED fires only at signed transition, not at workflow approval', async () => {
    const ipc = await createIpc(makeIpcInput(), roleUsers.qs_commercial!);
    await transitionIpc(ipc.id, 'submit', roleUsers.qs_commercial!);

    // Complete workflow
    const wf = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    const steps = wf!.template.steps;
    const roleOrder = [
      roleUsers.qs_commercial!,
      roleUsers.project_manager!,
      roleUsers.contracts_manager!,
      roleUsers.finance!,
      roleUsers.project_director!,
      roleUsers.document_controller!,
    ];
    for (let i = 0; i < steps.length; i++) {
      await workflowStepService.approveStep({
        instanceId: wf!.id,
        stepId: steps[i]!.id,
        actorUserId: roleOrder[i]!,
      });
    }

    // At approved_internal — NO posting event yet
    let postingEvents = await prisma.postingEvent.findMany({
      where: { sourceRecordId: ipc.id, eventType: 'IPC_SIGNED' },
    });
    expect(postingEvents).toHaveLength(0);

    // Sign transition — posting event fires HERE
    await transitionIpc(ipc.id, 'sign', roleUsers.project_director!);

    postingEvents = await prisma.postingEvent.findMany({
      where: { sourceRecordId: ipc.id, eventType: 'IPC_SIGNED' },
    });
    expect(postingEvents).toHaveLength(1);
    expect(postingEvents[0]!.eventType).toBe('IPC_SIGNED');
    expect(postingEvents[0]!.sourceRecordType).toBe('ipc');

    // Issue transition — no additional posting event
    await transitionIpc(ipc.id, 'issue', roleUsers.document_controller!);

    postingEvents = await prisma.postingEvent.findMany({
      where: { sourceRecordId: ipc.id, eventType: 'IPC_SIGNED' },
    });
    expect(postingEvents).toHaveLength(1); // still just 1
  });
});
