import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { prisma, SINGLETON_ORG_ID } from '@fmksa/db';
import { assertTestDb } from '../helpers/assert-test-db';
import { workflowTemplateService } from '../../src/workflow/templates';
import { workflowInstanceService } from '../../src/workflow';
import * as workflowEvents from '../../src/workflow/events';
import { createCostProposal } from '../../src/commercial/cost-proposal/service';

/**
 * PIC-80 — atomic create + autoSeed for cost_proposal.
 *
 * createCostProposal wraps entity-create + audit + workflow-instance seed in one
 * transaction, and emits 'workflow.started' (→ email) only AFTER commit via the
 * deferred-dispatch seam. These tests prove (D4):
 *   - rollback: a mid-seed failure rolls the create back (no orphan) AND nothing
 *     is emitted on the failed path (no leaked notification → no false atomicity)
 *   - positive: success persists entity + workflow_instance AND emits exactly once
 *     (deferral didn't drop the event; no double-emit)
 * Plus the D3 catch-24 check: the no-direct-status-write extension still fires on
 * writes made via an injected $transaction tx (the tx path can't bypass SR-2).
 *
 * Self-contained: a uniquely-coded cost_proposal template + a project-override
 * projectSetting make resolveTemplate succeed regardless of seed state (cluster-4
 * genuine-validation discipline — not reliant on residual seeded templates).
 */
describe('CostProposal atomic create+autoSeed (PIC-80)', () => {
  const ts = `cp-atomic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let testUser: { id: string };
  let testRole: { id: string; code: string };
  let testEntity: { id: string };
  let testProject: { id: string };
  const templateCode = `CP-ATOMIC-TPL-${ts}`;

  beforeAll(async () => {
    assertTestDb();

    testUser = await prisma.user.create({
      data: { orgId: SINGLETON_ORG_ID, email: `${ts}@test.com`, name: 'CP Atomic User', passwordHash: 'test-hash', status: 'active' },
    });
    testRole = await prisma.role.create({
      data: { code: `CPA-ROLE-${ts}`, name: 'CP Atomic Role', isSystem: false },
    });
    await prisma.userRole.create({
      data: { userId: testUser.id, roleId: testRole.id, effectiveFrom: new Date('2020-01-01'), assignedBy: testUser.id, assignedAt: new Date() },
    });
    testEntity = await prisma.entity.create({
      data: { orgId: SINGLETON_ORG_ID, code: `ENT-CPA-${ts}`, name: 'CP Atomic Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' },
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
      update: {},
    });
    testProject = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `PROJ-CPA-${ts}`, name: 'CP Atomic Project', entityId: testEntity.id,
        currencyCode: 'SAR', startDate: new Date(), createdBy: testUser.id, status: 'active',
      },
    });
    await prisma.projectAssignment.create({
      data: { projectId: testProject.id, userId: testUser.id, roleId: testRole.id, effectiveFrom: new Date('2020-01-01'), assignedBy: testUser.id, assignedAt: new Date() },
    });

    // Active cost_proposal template + project-override → resolveTemplate returns it.
    const tpl = await workflowTemplateService.createTemplate({
      code: templateCode,
      name: 'CP Atomic Template',
      recordType: 'cost_proposal',
      config: { allowComment: true, allowReturn: true, allowOverride: false },
      steps: [
        { orderIndex: 1, name: 'Review', approverRule: { type: 'role', roleCode: testRole.code }, slaHours: 24 },
      ],
      createdBy: testUser.id,
    });
    await workflowTemplateService.activateTemplate(tpl.id, testUser.id);
    await prisma.projectSetting.create({
      data: {
        projectId: testProject.id,
        key: 'workflow_template:cost_proposal',
        valueJson: templateCode,
        updatedAt: new Date(),
        updatedBy: testUser.id,
      },
    });
  });

  beforeEach(() => {
    workflowEvents.clearHandlers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    const tpls = await prisma.workflowTemplate.findMany({ where: { code: templateCode }, select: { id: true } });
    const ids = tpls.map((t) => t.id);
    if (ids.length > 0) {
      for (const tid of ids) {
        // workflow_actions is append-only (no-delete-on-immutable) → raw SQL.
        await (prisma as any).$executeRawUnsafe(
          `DELETE FROM workflow_actions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE template_id = '${tid}')`,
        );
      }
      await prisma.workflowInstance.deleteMany({ where: { templateId: { in: ids } } });
      await prisma.workflowStep.deleteMany({ where: { templateId: { in: ids } } });
      await prisma.workflowTemplate.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.costProposal.deleteMany({ where: { projectId: testProject.id } });
    // AuditLog is append-only (no-delete-on-immutable) → raw SQL bypass, same as
    // workflow_actions above. (Plain deleteMany is blocked by the middleware.)
    await (prisma as any).$executeRawUnsafe(
      `DELETE FROM audit_logs WHERE project_id = '${testProject.id}'`,
    );
    await prisma.projectSetting.deleteMany({ where: { projectId: testProject.id } });
    await prisma.projectAssignment.deleteMany({ where: { projectId: testProject.id } });
    await prisma.project.deleteMany({ where: { id: testProject.id } });
    await prisma.entity.deleteMany({ where: { id: testEntity.id } });
    await prisma.userRole.deleteMany({ where: { roleId: testRole.id } });
    await prisma.role.deleteMany({ where: { id: testRole.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  });

  const makeInput = () => ({
    projectId: testProject.id,
    revisionNumber: 1,
    estimatedCost: 75000,
    estimatedTimeDays: 45,
    methodology: 'Lump sum',
    costBreakdown: 'Labour 50k, Materials 25k',
    currency: 'SAR',
  });

  // POSITIVE: success → entity + workflow_instance persist, event emitted exactly once.
  it('positive: persists cost_proposal + workflow_instance and emits workflow.started exactly once', async () => {
    const startedHandler = vi.fn(async () => {});
    workflowEvents.on('workflow.started', startedHandler);

    const cp = await createCostProposal(makeInput(), testUser.id);

    const persisted = await prisma.costProposal.findUnique({ where: { id: cp.id } });
    expect(persisted).not.toBeNull();
    expect(persisted!.status).toBe('draft');

    const instance = await prisma.workflowInstance.findFirst({
      where: { recordType: 'cost_proposal', recordId: cp.id },
    });
    expect(instance).not.toBeNull();
    expect(instance!.status).toBe('in_progress');

    // Deferral didn't drop the event (not 0) and didn't double-emit (not 2).
    expect(startedHandler).toHaveBeenCalledTimes(1);
  });

  // ROLLBACK: a mid-seed failure rolls back the create AND emits nothing.
  it('rollback: workflow-seed failure rolls back the cost_proposal create and emits nothing', async () => {
    const before = await prisma.costProposal.count({ where: { projectId: testProject.id } });

    const startedHandler = vi.fn(async () => {});
    workflowEvents.on('workflow.started', startedHandler);

    // Inject a non-template, non-duplicate failure mid-seed (e.g. a transient DB error).
    const seedSpy = vi
      .spyOn(workflowInstanceService, 'startInstanceDeferred')
      .mockRejectedValueOnce(new Error('seed boom (injected)'));

    await expect(createCostProposal(makeInput(), testUser.id)).rejects.toThrow(/seed boom/);

    const after = await prisma.costProposal.count({ where: { projectId: testProject.id } });
    expect(after).toBe(before); // create rolled back — no orphaned entity
    expect(seedSpy).toHaveBeenCalledTimes(1);
    expect(startedHandler).toHaveBeenCalledTimes(0); // deferred emit never dispatched on the failed path
  });

  // D3 catch-24: the no-direct-status-write extension must still fire on writes
  // made through an injected $transaction tx — otherwise the tx-injection path
  // could silently bypass SR-2. A guarded status update via tx, outside
  // runAsWorkflowEngine, must be blocked.
  it('extension-on-tx: no-direct-status-write blocks a guarded status update made via $transaction tx', async () => {
    const cp = await createCostProposal(makeInput(), testUser.id);

    await expect(
      (prisma as any).$transaction(async (tx: any) => {
        await tx.costProposal.update({ where: { id: cp.id }, data: { status: 'submitted' } });
      }),
    ).rejects.toThrow();
  });
});
