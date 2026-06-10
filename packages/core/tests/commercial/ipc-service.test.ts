import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, SINGLETON_ORG_ID } from '@fmksa/db';
import { createIpc, transitionIpc, getIpc, listIpcs, deleteIpc } from '../../src/commercial/ipc/service';
import { createIpa, transitionIpa } from '../../src/commercial/ipa/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';
import {
  workflowInstanceService,
  workflowStepService,
  registerConvergenceHandlers,
} from '../../src/workflow';

/**
 * PIC-78 α-rewrite (2026-05-28):
 *
 * Workflow-managed actions (review/approve/reject ∈ IPC_WORKFLOW_MANAGED_ACTIONS)
 * driven via the workflow engine for both the parent-IPA setup (beforeAll) and
 * the IPC test subjects. submit (auto-start) + post-workflow lifecycle
 * (sign/issue/close) remain transitionIpc/transitionIpa calls.
 *
 * driveWorkflow(recordType, recordId) is generic + role-keyed off
 * step.approverRuleJson.roleCode — drives ipa_standard (5-step) and ipc_standard
 * (6-step incl Finance Check) uniformly. No domain-payload orphan (IPC/IPA
 * transitions carry no per-transition domain data).
 */

const ROLES_NEEDED = [
  'qs_commercial',
  'project_manager',
  'contracts_manager',
  'finance',
  'project_director',
  'document_controller',
] as const;

describe('IPC Service', () => {
  let testProject: { id: string; code: string; entityId: string };
  let approvedIpa: { id: string };
  const ts = Date.now();
  /** Map from role code → userId created for this test's project */
  const roleUsers: Record<string, string> = {};

  /**
   * α-helper: drive a workflow (ipa or ipc) through ALL steps via the engine →
   * approved_internal converges. Role-keyed off step.approverRuleJson.roleCode.
   */
  async function driveWorkflow(recordType: 'ipa' | 'ipc', recordId: string) {
    const instance = await workflowInstanceService.getInstanceByRecord(recordType, recordId);
    if (!instance) throw new Error(`No workflow instance for ${recordType} ${recordId}`);
    for (const step of instance.template.steps) {
      const rule = step.approverRuleJson as { type: string; roleCode: string };
      const approverId = roleUsers[rule.roleCode];
      if (!approverId) throw new Error(`No role user for ${rule.roleCode} (step ${step.name})`);
      await workflowStepService.approveStep({
        instanceId: instance.id,
        stepId: step.id,
        actorUserId: approverId,
        comment: `α-rewrite: ${step.name} approved`,
      });
    }
  }

  beforeAll(async () => {
    registerCommercialEventTypes();
    registerConvergenceHandlers();

    const entity = await prisma.entity.create({
      data: { orgId: SINGLETON_ORG_ID, code: `ENT-IPC-${ts}`, name: 'IPC Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `PROJ-IPC-${ts}`, name: 'IPC Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    // Create role users + project assignments for ipa_standard + ipc_standard approver roles
    for (const roleCode of ROLES_NEEDED) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new Error(`Role '${roleCode}' not found — run seed first`);
      const user = await prisma.user.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          name: `Test ${roleCode} ${ts}`,
          email: `test-ipc-${roleCode}-${ts}@test.com`,
          passwordHash: 'test-hash',
          status: 'active',
        },
      });
      await prisma.userRole.create({
        data: {
          userId: user.id, roleId: role.id,
          effectiveFrom: new Date('2020-01-01'),
          assignedBy: 'test-setup',
          assignedAt: new Date(),
        },
      });
      await prisma.projectAssignment.create({
        data: {
          userId: user.id, projectId: testProject.id, roleId: role.id,
          effectiveFrom: new Date('2020-01-01'),
          assignedBy: 'test-setup',
          assignedAt: new Date(),
        },
      });
      roleUsers[roleCode] = user.id;
    }

    // Create an IPA and drive it to approved_internal so IPC can be created against it
    const ipa = await createIpa({
      projectId: testProject.id,
      periodNumber: 1,
      periodFrom: new Date().toISOString(),
      periodTo: new Date().toISOString(),
      grossAmount: 100000,
      retentionRate: 0.1,
      retentionAmount: 10000,
      previousCertified: 0,
      currentClaim: 90000,
      netClaimed: 90000,
      currency: 'SAR',
    }, roleUsers.qs_commercial!);

    await transitionIpa(ipa.id, 'submit', roleUsers.qs_commercial!); // auto-starts IPA workflow
    await driveWorkflow('ipa', ipa.id); // → approved_internal converges
    approvedIpa = { id: ipa.id };
  });

  afterAll(async () => {
    // No template deactivation to reverse (templates stay active under α-pattern).
  });

  const makeInput = (overrides = {}) => ({
    projectId: testProject.id,
    ipaId: approvedIpa.id,
    certifiedAmount: 80000,
    retentionAmount: 8000,
    netCertified: 72000,
    certificationDate: new Date().toISOString(),
    currency: 'SAR',
    ...overrides,
  });

  it('cannot create IPC if parent IPA is in draft status', async () => {
    // Create a new IPA that stays in draft
    const draftIpa = await createIpa({
      projectId: testProject.id,
      periodNumber: 99,
      periodFrom: new Date().toISOString(),
      periodTo: new Date().toISOString(),
      grossAmount: 50000,
      retentionRate: 0.1,
      retentionAmount: 5000,
      previousCertified: 0,
      currentClaim: 45000,
      netClaimed: 45000,
      currency: 'SAR',
    }, 'test-user');

    await expect(
      createIpc(makeInput({ ipaId: draftIpa.id }), 'test-user'),
    ).rejects.toThrow(/parent IPA is in 'draft' status/);
  });

  it('can create IPC when parent IPA is approved_internal', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    expect(ipc).toBeTruthy();
    expect(ipc.ipaId).toBe(approvedIpa.id);
    expect(ipc.status).toBe('draft');
  });

  it('creates IPC in draft status', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    expect(ipc.status).toBe('draft');
    expect(ipc.projectId).toBe(testProject.id);
  });

  it('transitions draft -> submitted', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    const updated = await transitionIpc(ipc.id, 'submit', 'test-user');
    expect(updated.status).toBe('submitted');
  });

  it('rejects invalid transition draft -> approved_internal', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await expect(transitionIpc(ipc.id, 'approve', 'test-user')).rejects.toThrow();
  });

  it('full lifecycle: draft -> submitted -> under_review -> approved_internal -> signed -> issued -> closed', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user'); // auto-starts IPC workflow
    await driveWorkflow('ipc', ipc.id); // → approved_internal converges
    await transitionIpc(ipc.id, 'sign', 'test-user');
    await transitionIpc(ipc.id, 'issue', 'test-user');
    const closed = await transitionIpc(ipc.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  it('IPC_SIGNED posting event fires at signed transition', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user');
    await driveWorkflow('ipc', ipc.id);
    await transitionIpc(ipc.id, 'sign', 'test-user');

    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: ipc.id, eventType: 'IPC_SIGNED' },
    });
    expect(postingEvent).toBeTruthy();
  });

  it('assigns reference number at issued', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user');
    await driveWorkflow('ipc', ipc.id);
    await transitionIpc(ipc.id, 'sign', 'test-user');
    const issued = await transitionIpc(ipc.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-IPC-\\d{3}$`));
  });

  it('terminal status cannot be transitioned', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user');

    // Reject at first workflow step → workflow.rejected → convergence writes status='rejected'
    const instance = await workflowInstanceService.getInstanceByRecord('ipc', ipc.id);
    const firstStep = instance!.template.steps[0]!;
    const firstRule = firstStep.approverRuleJson as { type: string; roleCode: string };
    await workflowStepService.rejectStep({
      instanceId: instance!.id,
      stepId: firstStep.id,
      actorUserId: roleUsers[firstRule.roleCode]!,
      comment: 'α-rewrite: rejected at first step',
    });

    await expect(transitionIpc(ipc.id, 'submit', 'test-user')).rejects.toThrow();
  });

  it('deleteIpc only works in draft', async () => {
    const ipc = await createIpc(makeInput(), 'test-user');
    await deleteIpc(ipc.id, 'test-user', testProject.id);
    const deleted = await prisma.ipc.findUnique({ where: { id: ipc.id } });
    expect(deleted).toBeNull();
  });
});
