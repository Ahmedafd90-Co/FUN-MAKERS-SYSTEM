import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { createIpa, transitionIpa, getIpa, listIpas, deleteIpa, updateIpa } from '../../src/commercial/ipa/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';
import {
  workflowInstanceService,
  workflowStepService,
  registerConvergenceHandlers,
} from '../../src/workflow';

/**
 * PIC-78 α-rewrite (2026-05-28):
 *
 * The 3 previously-failing tests (full lifecycle, assigns reference, terminal
 * status) drive workflow-managed actions via `workflowStepService` instead of
 * calling `transitionIpa('review'|'approve'|'reject')` directly. The post-8656e57
 * Step 6 guard refuses workflow-managed actions unconditionally; correct shape
 * is the workflow engine API per `no-direct-status-write.ts` header rule
 * ("THERE ARE ONLY TWO BYPASSES. Do not add a third").
 *
 * Templates stay ACTIVE (legacy deactivation pattern dropped). Role users +
 * project assignments created for each ipa_standard approver role.
 *
 * Catch 24 / SR-3 step 5: this α-rewrite verified at runtime via V-2 (draft PR
 * + CI watch) before generalizing to the other 6 Class A files.
 */

const ROLES_NEEDED = [
  'qs_commercial',
  'project_manager',
  'contracts_manager',
  'project_director',
  'document_controller',
] as const;

describe('IPA Service', () => {
  let testProject: { id: string; code: string; entityId: string };
  const ts = Date.now();
  /** Map from role code → userId created for this test's project */
  const roleUsers: Record<string, string> = {};

  beforeAll(async () => {
    registerCommercialEventTypes();
    registerConvergenceHandlers();

    const entity = await prisma.entity.create({
      data: { code: `ENT-IPA-${ts}`, name: 'IPA Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-IPA-${ts}`, name: 'IPA Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    // Create role users + project assignments for ipa_standard approver roles
    for (const roleCode of ROLES_NEEDED) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new Error(`Role '${roleCode}' not found — run seed first`);
      const user = await prisma.user.create({
        data: {
          name: `Test ${roleCode} ${ts}`,
          email: `test-ipa-${roleCode}-${ts}@test.com`,
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

  const makeInput = (overrides = {}) => ({
    projectId: testProject.id,
    periodNumber: 1,
    periodFrom: new Date().toISOString(),
    periodTo: new Date().toISOString(),
    grossAmount: 10000,
    retentionRate: 0.1,
    retentionAmount: 1000,
    previousCertified: 0,
    currentClaim: 9000,
    netClaimed: 9000,
    currency: 'SAR',
    ...overrides,
  });

  /**
   * α-helper: drive workflow through ipa_standard template steps until the
   * specified outcomeType ('sign' = approved_internal converged; 'issue' =
   * issued converged). Returns after the final approveStep call.
   *
   * Template `ipa_standard` (5 steps):
   *   1. QS/Commercial Prepare (qs_commercial) — review
   *   2. PM Review (project_manager) — review
   *   3. Contracts Manager Review (contracts_manager) — review
   *   4. PD Sign (project_director) — sign  ← approved_internal converges here
   *   5. Issue (document_controller) — issue ← issued converges here (optional)
   */
  async function driveIpaWorkflow(ipaId: string, untilOutcome: 'sign' | 'issue') {
    const instance = await workflowInstanceService.getInstanceByRecord('ipa', ipaId);
    if (!instance) throw new Error(`No workflow instance found for IPA ${ipaId}`);
    const stepApprovers: Record<string, string> = {
      'QS/Commercial Prepare': roleUsers.qs_commercial!,
      'PM Review': roleUsers.project_manager!,
      'Contracts Manager Review': roleUsers.contracts_manager!,
      'PD Sign': roleUsers.project_director!,
      'Issue': roleUsers.document_controller!,
    };

    for (const step of instance.template.steps) {
      await workflowStepService.approveStep({
        instanceId: instance.id,
        stepId: step.id,
        actorUserId: stepApprovers[step.name]!,
        comment: `α-rewrite: ${step.name} approved`,
      });
      if (step.outcomeType === untilOutcome) break;
    }
  }

  it('creates IPA in draft status', async () => {
    const ipa = await createIpa(makeInput(), 'test-user');
    expect(ipa.status).toBe('draft');
    expect(ipa.projectId).toBe(testProject.id);
  });

  it('transitions draft -> submitted', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 2 }), 'test-user');
    const updated = await transitionIpa(ipa.id, 'submit', 'test-user');
    expect(updated.status).toBe('submitted');
  });

  it('rejects invalid transition draft -> approved_internal', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 3 }), 'test-user');
    await expect(transitionIpa(ipa.id, 'approve', 'test-user')).rejects.toThrow();
  });

  it('full lifecycle with posting at approved_internal', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 4 }), 'test-user');
    await transitionIpa(ipa.id, 'submit', 'test-user'); // auto-starts ipa_standard workflow
    await driveIpaWorkflow(ipa.id, 'sign'); // approves steps 1-4 (PD Sign → approved_internal converges)

    const updated = await prisma.ipa.findUniqueOrThrow({ where: { id: ipa.id } });
    expect(updated.status).toBe('approved_internal');

    // Verify posting event was created (convergence handler fires IPA_APPROVED)
    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: ipa.id, eventType: 'IPA_APPROVED' },
    });
    expect(postingEvent).toBeTruthy();
  });

  it('assigns reference number at issued', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 5 }), 'test-user');
    await transitionIpa(ipa.id, 'submit', 'test-user');
    await driveIpaWorkflow(ipa.id, 'issue'); // approves steps 1-5 (Issue → issued converges + ref number assigned)

    const issued = await prisma.ipa.findUniqueOrThrow({ where: { id: ipa.id } });
    expect(issued.status).toBe('issued');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-IPA-\\d{3}$`));
  });

  it('terminal status cannot be transitioned', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 6 }), 'test-user');
    await transitionIpa(ipa.id, 'submit', 'test-user');

    // Reject at first step → workflow terminates as rejected; convergence writes entity.status = 'rejected'
    const instance = await workflowInstanceService.getInstanceByRecord('ipa', ipa.id);
    const firstStep = instance!.template.steps[0]!;
    await workflowStepService.rejectStep({
      instanceId: instance!.id,
      stepId: firstStep.id,
      actorUserId: roleUsers.qs_commercial!,
      comment: 'α-rewrite: rejected at first step',
    });

    const rejected = await prisma.ipa.findUniqueOrThrow({ where: { id: ipa.id } });
    expect(rejected.status).toBe('rejected');

    // Terminal status — submit must throw
    await expect(transitionIpa(ipa.id, 'submit', 'test-user')).rejects.toThrow();
  });

  it('updateIpa only works in draft/returned status', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 8 }), 'test-user');
    // Should work in draft
    const updated = await updateIpa({ id: ipa.id, grossAmount: 20000 }, 'test-user', testProject.id);
    expect(Number(updated.grossAmount)).toBe(20000);

    // Transition to submitted — update should fail
    await transitionIpa(ipa.id, 'submit', 'test-user');
    await expect(updateIpa({ id: ipa.id, grossAmount: 30000 }, 'test-user', testProject.id)).rejects.toThrow();
  });

  it('deleteIpa only works in draft', async () => {
    const ipa = await createIpa(makeInput({ periodNumber: 7 }), 'test-user');
    await deleteIpa(ipa.id, 'test-user', testProject.id);
    const deleted = await prisma.ipa.findUnique({ where: { id: ipa.id } });
    expect(deleted).toBeNull();
  });

  it('listIpas returns paginated results', async () => {
    const result = await listIpas({
      projectId: testProject.id,
      skip: 0,
      take: 10,
      sortDirection: 'desc',
    });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });
});
