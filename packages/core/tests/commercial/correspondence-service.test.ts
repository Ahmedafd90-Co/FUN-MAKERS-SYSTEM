import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  createCorrespondence,
  transitionCorrespondence,
  getCorrespondence,
  listCorrespondences,
  deleteCorrespondence,
} from '../../src/commercial/correspondence/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';
import {
  workflowInstanceService,
  workflowStepService,
  registerConvergenceHandlers,
} from '../../src/workflow';

/**
 * PIC-78 α-rewrite (2026-05-28):
 *
 * The workflow-managed action `approve` (∈ CORRESPONDENCE_WORKFLOW_MANAGED_ACTIONS
 * = ['approve','reject','return']) is driven via the workflow engine instead of
 * transitionCorrespondence, which refuses it post-8656e57. submit (auto-starts
 * workflow) and all post-workflow lifecycle transitions (sign / issue / close /
 * mark_response_due / mark_responded / evaluate / accept / acknowledge / recover)
 * remain transitionCorrespondence calls — non-WMA, self-wrap via runAsWorkflowEngine.
 *
 * driveCorrespondenceWorkflow is role-keyed off each step's approverRuleJson.roleCode
 * — template-agnostic, so it handles every subtype template (letter_standard 3-step
 * no-sign, claim_with_finance 5-step, etc.) uniformly. All subtypes converge to
 * approved_internal via handleCorrespondenceApproved on workflow.approved.
 *
 * No domain-payload orphan here (unlike variation): transitionCorrespondence carries
 * no per-transition domain data — signature is (id, action, actorUserId, comment?,
 * projectId?). Standard α-rewrite.
 */

const ROLES_NEEDED = [
  'qs_commercial',
  'project_manager',
  'contracts_manager',
  'finance',
  'cost_controller',
  'project_director',
  'document_controller',
] as const;

describe('Correspondence Service', () => {
  let testProject: { id: string; code: string; entityId: string };
  const ts = Date.now();
  /** Map from role code → userId created for this test's project */
  const roleUsers: Record<string, string> = {};

  beforeAll(async () => {
    registerCommercialEventTypes();
    registerConvergenceHandlers();

    const entity = await prisma.entity.create({
      data: { code: `ENT-COR-${ts}`, name: 'Correspondence Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-COR-${ts}`, name: 'Correspondence Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    // Create role users + project assignments for all correspondence template approver roles
    for (const roleCode of ROLES_NEEDED) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new Error(`Role '${roleCode}' not found — run seed first`);
      const user = await prisma.user.create({
        data: {
          name: `Test ${roleCode} ${ts}`,
          email: `test-cor-${roleCode}-${ts}@test.com`,
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
  });

  const makeInput = (subtype: 'letter' | 'notice' | 'claim' | 'back_charge', overrides = {}) => ({
    projectId: testProject.id,
    subtype,
    subject: `Test ${subtype}`,
    body: `Body for ${subtype}`,
    recipientName: 'Test Recipient',
    recipientOrg: 'Test Org',
    currency: 'SAR',
    ...(subtype === 'notice' ? { noticeType: 'general' as const, contractClause: 'Clause 1', responseDeadline: new Date(Date.now() + 86400000).toISOString() } : {}),
    ...(subtype === 'claim' ? { claimType: 'additional_cost' as const, claimedAmount: 50000, claimedTimeDays: 30 } : {}),
    ...(subtype === 'back_charge' ? { targetName: 'Subcontractor A', category: 'defect' as const, chargedAmount: 25000, evidenceDescription: 'Defective work on Zone B' } : {}),
    ...(subtype === 'letter' ? { letterType: 'instruction' as const } : {}),
    ...overrides,
  });

  /**
   * α-helper: drive correspondence workflow through ALL steps via the workflow
   * engine → approved_internal converges. Role-keyed off step.approverRuleJson.roleCode
   * (template-agnostic across subtype templates).
   */
  async function driveCorrespondenceWorkflow(correspondenceId: string) {
    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', correspondenceId);
    if (!instance) throw new Error(`No workflow instance for correspondence ${correspondenceId}`);
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

  // 1. Letter lifecycle WITHOUT signing (optional signing for letters)
  it('letter lifecycle without signing: create -> submit -> approve -> issue -> close', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Letter no sign' }), 'test-user');
    expect(corr.status).toBe('draft');
    expect(corr.subtype).toBe('letter');

    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    const approved = await getCorrespondence(corr.id, testProject.id);
    expect(approved.status).toBe('approved_internal');

    // Letter can skip signing and go directly to issued
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');

    const closed = await transitionCorrespondence(corr.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 2. Letter lifecycle WITH signing
  it('letter lifecycle with signing: create -> submit -> approve -> sign -> issue -> close', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Letter with sign' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');

    const closed = await transitionCorrespondence(corr.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 3. Notice lifecycle with response tracking
  it('notice lifecycle with response tracking', async () => {
    const corr = await createCorrespondence(makeInput('notice', { subject: 'Notice lifecycle' }), 'test-user');
    expect(corr.subtype).toBe('notice');

    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');

    const responseDue = await transitionCorrespondence(corr.id, 'mark_response_due', 'test-user');
    expect(responseDue.status).toBe('response_due');

    const responded = await transitionCorrespondence(corr.id, 'mark_responded', 'test-user');
    expect(responded.status).toBe('responded');

    const closed = await transitionCorrespondence(corr.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 4. Claim lifecycle with posting
  it('claim lifecycle with CLAIM_ISSUED posting event', async () => {
    const corr = await createCorrespondence(makeInput('claim', { subject: 'Claim lifecycle' }), 'test-user');
    expect(corr.subtype).toBe('claim');

    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    await transitionCorrespondence(corr.id, 'issue', 'test-user');

    // Verify CLAIM_ISSUED posting event
    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'CLAIM_ISSUED' },
    });
    expect(postingEvent).toBeTruthy();
    expect(postingEvent!.idempotencyKey).toBe(`correspondence:${corr.id}:claim_issued`);

    await transitionCorrespondence(corr.id, 'evaluate', 'test-user');
    const accepted = await transitionCorrespondence(corr.id, 'accept', 'test-user');
    expect(accepted.status).toBe('accepted');

    const closed = await transitionCorrespondence(corr.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 5. Back charge lifecycle with posting
  it('back charge lifecycle with BACK_CHARGE_ISSUED posting event', async () => {
    const corr = await createCorrespondence(makeInput('back_charge', { subject: 'BC lifecycle' }), 'test-user');
    expect(corr.subtype).toBe('back_charge');

    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    await transitionCorrespondence(corr.id, 'issue', 'test-user');

    // Verify BACK_CHARGE_ISSUED posting event
    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'BACK_CHARGE_ISSUED' },
    });
    expect(postingEvent).toBeTruthy();
    expect(postingEvent!.idempotencyKey).toBe(`correspondence:${corr.id}:back_charge_issued`);

    await transitionCorrespondence(corr.id, 'acknowledge', 'test-user');
    const recovered = await transitionCorrespondence(corr.id, 'recover', 'test-user');
    expect(recovered.status).toBe('recovered');

    const closed = await transitionCorrespondence(corr.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 6. Subtype isolation: claim cannot use notice-specific statuses
  it('claim cannot use notice-specific action mark_response_due', async () => {
    const corr = await createCorrespondence(makeInput('claim', { subject: 'Claim isolation' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    await transitionCorrespondence(corr.id, 'issue', 'test-user');

    await expect(
      transitionCorrespondence(corr.id, 'mark_response_due', 'test-user'),
    ).rejects.toThrow(/Invalid Correspondence transition/);
  });

  // 7. Letter and Notice do not fire posting events at issued
  it('letter does not fire posting events at issued', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Letter no posting' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    await transitionCorrespondence(corr.id, 'issue', 'test-user');

    const claimEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'CLAIM_ISSUED' },
    });
    const bcEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'BACK_CHARGE_ISSUED' },
    });
    expect(claimEvent).toBeNull();
    expect(bcEvent).toBeNull();
  });

  it('notice does not fire posting events at issued', async () => {
    const corr = await createCorrespondence(makeInput('notice', { subject: 'Notice no posting' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    await transitionCorrespondence(corr.id, 'issue', 'test-user');

    const claimEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'CLAIM_ISSUED' },
    });
    const bcEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: corr.id, eventType: 'BACK_CHARGE_ISSUED' },
    });
    expect(claimEvent).toBeNull();
    expect(bcEvent).toBeNull();
  });

  // 8. Reference number type codes
  it('letter reference number uses LTR type code', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Letter ref' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-LTR-\\d{3}$`));
  });

  it('notice reference number uses NTC type code', async () => {
    const corr = await createCorrespondence(makeInput('notice', { subject: 'Notice ref' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-NTC-\\d{3}$`));
  });

  it('claim reference number uses CLM type code', async () => {
    const corr = await createCorrespondence(makeInput('claim', { subject: 'Claim ref' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-CLM-\\d{3}$`));
  });

  it('back_charge reference number uses BCH type code', async () => {
    const corr = await createCorrespondence(makeInput('back_charge', { subject: 'BC ref' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await driveCorrespondenceWorkflow(corr.id);
    await transitionCorrespondence(corr.id, 'sign', 'test-user');
    const issued = await transitionCorrespondence(corr.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-BCH-\\d{3}$`));
  });

  // 9. Delete only in draft
  it('delete only in draft', async () => {
    const corr = await createCorrespondence(makeInput('letter'), 'test-user');
    await deleteCorrespondence(corr.id, 'test-user', testProject.id);
    const deleted = await prisma.correspondence.findUnique({ where: { id: corr.id } });
    expect(deleted).toBeNull();
  });

  it('delete rejects non-draft correspondence', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Delete non-draft' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');
    await expect(deleteCorrespondence(corr.id, 'test-user', testProject.id)).rejects.toThrow(/Only draft/);
  });

  // 10. List with subtypeFilter
  it('list with subtypeFilter', async () => {
    // Create one of each subtype
    await createCorrespondence(makeInput('letter', { subject: 'List letter' }), 'test-user');
    await createCorrespondence(makeInput('notice', { subject: 'List notice' }), 'test-user');
    await createCorrespondence(makeInput('claim', { subject: 'List claim' }), 'test-user');

    const result = await listCorrespondences(
      { projectId: testProject.id, skip: 0, take: 20, sortDirection: 'desc' },
      { subtypeFilter: 'letter' },
    );
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    for (const item of result.items) {
      expect(item.subtype).toBe('letter');
    }

    const allResult = await listCorrespondences({ projectId: testProject.id, skip: 0, take: 50, sortDirection: 'desc' });
    expect(allResult.total).toBeGreaterThanOrEqual(3);
  });

  // 11. Terminal status cannot be transitioned
  it('terminal status cannot be transitioned', async () => {
    const corr = await createCorrespondence(makeInput('letter', { subject: 'Terminal test' }), 'test-user');
    await transitionCorrespondence(corr.id, 'submit', 'test-user');

    // Reject at first workflow step → workflow.rejected → convergence writes status='rejected'
    const instance = await workflowInstanceService.getInstanceByRecord('correspondence', corr.id);
    const firstStep = instance!.template.steps[0]!;
    const firstRule = firstStep.approverRuleJson as { type: string; roleCode: string };
    await workflowStepService.rejectStep({
      instanceId: instance!.id,
      stepId: firstStep.id,
      actorUserId: roleUsers[firstRule.roleCode]!,
      comment: 'α-rewrite: rejected at first step',
    });

    await expect(
      transitionCorrespondence(corr.id, 'submit', 'test-user'),
    ).rejects.toThrow(/terminal status/);
  });
});
