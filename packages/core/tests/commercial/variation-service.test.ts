import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, SINGLETON_ORG_ID } from '@fmksa/db';
import {
  createVariation,
  transitionVariation,
  getVariation,
  listVariations,
  deleteVariation,
} from '../../src/commercial/variation/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';
import {
  workflowInstanceService,
  workflowStepService,
  registerConvergenceHandlers,
} from '../../src/workflow';

/**
 * PIC-78 α-rewrite (2026-05-28):
 *
 * Workflow-managed actions (review/approve/reject/return ∈
 * VARIATION_WORKFLOW_MANAGED_ACTIONS) are driven via the workflow engine
 * (workflowStepService) instead of transitionVariation, which refuses them
 * unconditionally post-8656e57. Post-workflow lifecycle transitions
 * (sign / issue / client_pending / client_approved / close) remain
 * transitionVariation calls — they self-wrap via runAsWorkflowEngine and are
 * NOT a third bypass.
 *
 * Two tests SKIPPED pending PIC-79: the assessment-data-on-transition feature
 * (assessedCostImpact / approvedCostImpact passed to review/approve) was
 * orphaned by 8656e57 — no reachable code path post-guard. PIC-79 carries the
 * product decision on where displaced assessment data lives. See it.skip below.
 */

const ROLES_NEEDED = [
  'qs_commercial',
  'project_manager',
  'contracts_manager',
  'finance',
  'project_director',
  'document_controller',
] as const;

describe('Variation Service', () => {
  let testProject: { id: string; code: string; entityId: string };
  const ts = Date.now();
  /** Map from role code → userId created for this test's project */
  const roleUsers: Record<string, string> = {};

  beforeAll(async () => {
    registerCommercialEventTypes();
    registerConvergenceHandlers();

    const entity = await prisma.entity.create({
      data: { orgId: SINGLETON_ORG_ID, code: `ENT-VAR-${ts}`, name: 'Variation Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `PROJ-VAR-${ts}`, name: 'Variation Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    // Create role users + project assignments for variation_standard approver roles
    for (const roleCode of ROLES_NEEDED) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new Error(`Role '${roleCode}' not found — run seed first`);
      const user = await prisma.user.create({
        data: {
          orgId: SINGLETON_ORG_ID,
          name: `Test ${roleCode} ${ts}`,
          email: `test-var-${roleCode}-${ts}@test.com`,
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

  const makeVoInput = (overrides = {}) => ({
    projectId: testProject.id,
    subtype: 'vo' as const,
    title: 'Test VO',
    description: 'VO description',
    reason: 'scope change',
    costImpact: 50000,
    timeImpactDays: 30,
    currency: 'SAR',
    ...overrides,
  });

  const makeCoInput = (overrides = {}) => ({
    projectId: testProject.id,
    subtype: 'change_order' as const,
    title: 'Test CO',
    description: 'CO description',
    reason: 'contract adjustment',
    costImpact: 100000,
    timeImpactDays: 60,
    currency: 'SAR',
    originalContractValue: 1000000,
    adjustmentAmount: 100000,
    newContractValue: 1100000,
    ...overrides,
  });

  /**
   * α-helper: drive the variation workflow through ALL steps via the workflow
   * engine. workflow.approved fires after every approvable step completes;
   * the convergence handler then writes variation.status = 'approved_internal'.
   * Role-keyed off each step's approverRuleJson.roleCode (template-agnostic).
   */
  async function driveVariationWorkflow(variationId: string) {
    const instance = await workflowInstanceService.getInstanceByRecord('variation', variationId);
    if (!instance) throw new Error(`No workflow instance for variation ${variationId}`);
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

  // 1. Create VO in draft status
  it('creates VO in draft status', async () => {
    const variation = await createVariation(makeVoInput(), 'test-user');
    expect(variation.status).toBe('draft');
    expect(variation.subtype).toBe('vo');
    expect(variation.projectId).toBe(testProject.id);
  });

  // 2. Create CO in draft status
  it('creates CO in draft status', async () => {
    const variation = await createVariation(makeCoInput(), 'test-user');
    expect(variation.status).toBe('draft');
    expect(variation.subtype).toBe('change_order');
    expect(variation.projectId).toBe(testProject.id);
  });

  // 3. VO full lifecycle: draft -> submitted -> (workflow) -> approved_internal -> signed -> issued -> client_pending -> client_approved -> closed
  it('VO full lifecycle through client_approved -> closed', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO lifecycle' }), 'test-user');

    await transitionVariation(variation.id, 'submit', 'test-user'); // auto-starts workflow
    await driveVariationWorkflow(variation.id); // → approved_internal converges
    const approved = await getVariation(variation.id, testProject.id);
    expect(approved.status).toBe('approved_internal');

    await transitionVariation(variation.id, 'sign', 'test-user');
    const issued = await transitionVariation(variation.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');

    await transitionVariation(variation.id, 'client_pending', 'test-user');
    const clientApproved = await transitionVariation(variation.id, 'client_approved', 'test-user');
    expect(clientApproved.status).toBe('client_approved');

    const closed = await transitionVariation(variation.id, 'close', 'test-user');
    expect(closed.status).toBe('closed');
  });

  // 4. CO cannot transition to client_pending from issued
  it('CO cannot transition to client_pending from issued', async () => {
    const variation = await createVariation(makeCoInput({ title: 'CO no client' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await driveVariationWorkflow(variation.id);
    await transitionVariation(variation.id, 'sign', 'test-user');
    await transitionVariation(variation.id, 'issue', 'test-user');

    await expect(
      transitionVariation(variation.id, 'client_pending', 'test-user'),
    ).rejects.toThrow(/Invalid Variation transition/);
  });

  // 5. VARIATION_APPROVED_INTERNAL fires at approved_internal
  it('VARIATION_APPROVED_INTERNAL fires at approved_internal', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO posting internal' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await driveVariationWorkflow(variation.id);

    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: variation.id, eventType: 'VARIATION_APPROVED_INTERNAL' },
    });
    expect(postingEvent).toBeTruthy();
    expect(postingEvent!.idempotencyKey).toBe(`variation:${variation.id}:approved_internal`);
  });

  // 6. VARIATION_APPROVED_CLIENT fires at client_approved
  it('VARIATION_APPROVED_CLIENT fires at client_approved', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO posting client' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await driveVariationWorkflow(variation.id);
    await transitionVariation(variation.id, 'sign', 'test-user');
    await transitionVariation(variation.id, 'issue', 'test-user');
    await transitionVariation(variation.id, 'client_pending', 'test-user');
    await transitionVariation(variation.id, 'client_approved', 'test-user');

    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: variation.id, eventType: 'VARIATION_APPROVED_CLIENT' },
    });
    expect(postingEvent).toBeTruthy();
    expect(postingEvent!.idempotencyKey).toBe(`variation:${variation.id}:client_approved`);
  });

  // 7. Reference number uses VO type code for vo, CO for change_order
  it('reference number uses VO type code for vo subtype', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO ref num' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await driveVariationWorkflow(variation.id);
    await transitionVariation(variation.id, 'sign', 'test-user');
    const issued = await transitionVariation(variation.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-VO-\\d{3}$`));
  });

  it('reference number uses CO type code for change_order subtype', async () => {
    const variation = await createVariation(makeCoInput({ title: 'CO ref num' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await driveVariationWorkflow(variation.id);
    await transitionVariation(variation.id, 'sign', 'test-user');
    const issued = await transitionVariation(variation.id, 'issue', 'test-user');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-CO-\\d{3}$`));
  });

  // 8. Assessment fields populated at review (assessed) and approve (approved)
  //
  // SKIPPED pending PIC-79. The assessment-data-on-transition feature
  // (assessedCostImpact/approvedCostImpact passed to review/approve) was
  // orphaned by 8656e57: review/approve are now workflow-managed and refuse
  // the assessmentData payload at the service layer, and the workflow-step
  // API carries no domain data. updateVariation only works in draft/returned.
  // There is no reachable post-8656e57 code path for this behavior. PIC-79
  // carries the product decision on where displaced assessment data lives.
  it.skip('assessment fields populated at review and approve [PIC-79-ORPHAN: assessment-data via transition orphaned by 8656e57]', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO assessment' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');

    const reviewed = await transitionVariation(
      variation.id, 'review', 'test-user', undefined,
      { assessedCostImpact: 45000, assessedTimeImpactDays: 25 },
    );
    expect(Number(reviewed.assessedCostImpact)).toBe(45000);
    expect(reviewed.assessedTimeImpactDays).toBe(25);

    const approved = await transitionVariation(
      variation.id, 'approve', 'test-user', undefined,
      { approvedCostImpact: 42000, approvedTimeImpactDays: 20 },
    );
    expect(Number(approved.approvedCostImpact)).toBe(42000);
    expect(approved.approvedTimeImpactDays).toBe(20);
  });

  // 9. Assessment fields remain null when not provided
  //
  // SKIPPED pending PIC-79 — same orphaned-feature root cause as test 8.
  it.skip('assessment fields remain null when not provided in transition data [PIC-79-ORPHAN: assessment-data via transition orphaned by 8656e57]', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO no assessment' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');

    const reviewed = await transitionVariation(variation.id, 'review', 'test-user');
    expect(reviewed.assessedCostImpact).toBeNull();
    expect(reviewed.assessedTimeImpactDays).toBeNull();

    const approved = await transitionVariation(variation.id, 'approve', 'test-user');
    expect(approved.approvedCostImpact).toBeNull();
    expect(approved.approvedTimeImpactDays).toBeNull();
  });

  // 10. Terminal status cannot be transitioned
  it('terminal status cannot be transitioned', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO terminal' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');

    // Reject at first workflow step → workflow.rejected → convergence writes status='rejected'
    const instance = await workflowInstanceService.getInstanceByRecord('variation', variation.id);
    const firstStep = instance!.template.steps[0]!;
    const firstRule = firstStep.approverRuleJson as { type: string; roleCode: string };
    await workflowStepService.rejectStep({
      instanceId: instance!.id,
      stepId: firstStep.id,
      actorUserId: roleUsers[firstRule.roleCode]!,
      comment: 'α-rewrite: rejected at first step',
    });

    await expect(
      transitionVariation(variation.id, 'submit', 'test-user'),
    ).rejects.toThrow(/terminal status/);
  });

  // 11. Delete only in draft
  it('delete only in draft', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO delete draft' }), 'test-user');
    await deleteVariation(variation.id, 'test-user', testProject.id);
    const deleted = await prisma.variation.findUnique({ where: { id: variation.id } });
    expect(deleted).toBeNull();
  });

  it('delete rejects non-draft variation', async () => {
    const variation = await createVariation(makeVoInput({ title: 'VO delete submitted' }), 'test-user');
    await transitionVariation(variation.id, 'submit', 'test-user');
    await expect(deleteVariation(variation.id, 'test-user', testProject.id)).rejects.toThrow(/Only draft/);
  });
});
