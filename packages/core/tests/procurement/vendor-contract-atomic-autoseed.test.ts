import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@fmksa/db';
import { assertTestDb } from '../helpers/assert-test-db';
import { workflowTemplateService } from '../../src/workflow/templates';
import { workflowInstanceService } from '../../src/workflow';
import * as workflowEvents from '../../src/workflow/events';
import { createVendorContract } from '../../src/procurement/vendor-contract/service';

/**
 * PIC-80 PB2 — atomic create+autoSeed for vendor_contract (rollback + positive).
 * Same P2002-retry-$transaction + conditional-seed shape as framework-agreement.
 * Self-contained via project-override template.
 */
describe('VendorContract atomic create+autoSeed (PIC-80)', () => {
  const ts = `vc-atomic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let testUser: { id: string };
  let testRole: { id: string; code: string };
  let testEntity: { id: string };
  let testVendor: { id: string };
  let testProject: { id: string };
  const templateCode = `VC-ATOMIC-TPL-${ts}`;

  beforeAll(async () => {
    assertTestDb();
    testUser = await prisma.user.create({ data: { email: `${ts}@test.com`, name: 'VC Atomic User', passwordHash: 'test-hash', status: 'active' } });
    testRole = await prisma.role.create({ data: { code: `VCA-ROLE-${ts}`, name: 'VC Atomic Role', isSystem: false } });
    await prisma.userRole.create({ data: { userId: testUser.id, roleId: testRole.id, effectiveFrom: new Date('2020-01-01'), assignedBy: testUser.id, assignedAt: new Date() } });
    testEntity = await prisma.entity.create({ data: { code: `ENT-VCA-${ts}`, name: 'VC Atomic Entity', type: 'parent', status: 'active' } });
    testVendor = await prisma.vendor.create({ data: { entityId: testEntity.id, vendorCode: `VEN-VCA-${ts}`, name: `VC Atomic Vendor ${ts}`, status: 'active', createdBy: testUser.id } });
    await prisma.currency.upsert({ where: { code: 'SAR' }, create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 }, update: {} });
    testProject = await prisma.project.create({ data: { code: `PROJ-VCA-${ts}`, name: 'VC Atomic Project', entityId: testEntity.id, currencyCode: 'SAR', startDate: new Date(), createdBy: testUser.id, status: 'active' } });
    await prisma.projectAssignment.create({ data: { projectId: testProject.id, userId: testUser.id, roleId: testRole.id, effectiveFrom: new Date('2020-01-01'), assignedBy: testUser.id, assignedAt: new Date() } });

    const tpl = await workflowTemplateService.createTemplate({
      code: templateCode, name: 'VC Atomic Template', recordType: 'vendor_contract',
      config: { allowComment: true, allowReturn: true, allowOverride: false },
      steps: [{ orderIndex: 1, name: 'Review', approverRule: { type: 'role', roleCode: testRole.code }, slaHours: 24 }],
      createdBy: testUser.id,
    });
    await workflowTemplateService.activateTemplate(tpl.id, testUser.id);
    await prisma.projectSetting.create({ data: { projectId: testProject.id, key: 'workflow_template:vendor_contract', valueJson: templateCode, updatedAt: new Date(), updatedBy: testUser.id } });
  });

  beforeEach(() => { workflowEvents.clearHandlers(); });
  afterEach(() => { vi.restoreAllMocks(); });

  afterAll(async () => {
    const tpls = await prisma.workflowTemplate.findMany({ where: { code: templateCode }, select: { id: true } });
    const ids = tpls.map((t) => t.id);
    if (ids.length > 0) {
      for (const tid of ids) {
        await (prisma as any).$executeRawUnsafe(`DELETE FROM workflow_actions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE template_id = '${tid}')`);
      }
      await prisma.workflowInstance.deleteMany({ where: { templateId: { in: ids } } });
      await prisma.workflowStep.deleteMany({ where: { templateId: { in: ids } } });
      await prisma.workflowTemplate.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.vendorContract.deleteMany({ where: { projectId: testProject.id } });
    await (prisma as any).$executeRawUnsafe(`DELETE FROM audit_logs WHERE project_id = '${testProject.id}'`);
    await prisma.projectSetting.deleteMany({ where: { projectId: testProject.id } });
    await prisma.projectAssignment.deleteMany({ where: { projectId: testProject.id } });
    await prisma.project.deleteMany({ where: { id: testProject.id } });
    await prisma.vendor.deleteMany({ where: { id: testVendor.id } });
    await prisma.entity.deleteMany({ where: { id: testEntity.id } });
    await prisma.userRole.deleteMany({ where: { roleId: testRole.id } });
    await prisma.role.deleteMany({ where: { id: testRole.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  });

  const makeInput = () => ({
    projectId: testProject.id,
    vendorId: testVendor.id,
    title: `VC ${ts}`,
    contractType: 'service',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    totalValue: 100000,
    currency: 'SAR',
  });

  it('positive: persists vendor_contract + workflow_instance and emits workflow.started exactly once', async () => {
    const startedHandler = vi.fn(async (_payload: any) => {});
    workflowEvents.on('workflow.started', startedHandler);

    const record = await createVendorContract(makeInput() as any, testUser.id);

    const persisted = await prisma.vendorContract.findUnique({ where: { id: record.id } });
    expect(persisted).not.toBeNull();

    const instance = await prisma.workflowInstance.findFirst({ where: { recordType: 'vendor_contract', recordId: record.id } });
    expect(instance).not.toBeNull();
    expect(instance!.status).toBe('in_progress');

    const startedForThis = startedHandler.mock.calls.filter((c) => (c[0] as any)?.recordId === record.id);
    expect(startedForThis.length).toBe(1);
  });

  it('rollback: a create+seed failure leaves no orphan and emits nothing', async () => {
    const before = await prisma.vendorContract.count({ where: { projectId: testProject.id } });
    const startedHandler = vi.fn(async (_payload: any) => {});
    workflowEvents.on('workflow.started', startedHandler);
    // Inject a seed failure (mockRejectedValue survives the create's P2002-retry).
    // vendor_contract uses a GLOBALLY-unique sequential contractNumber, so under
    // parallel workers the create can P2002 before the seed; we assert the
    // atomicity INVARIANT (no orphan + no emit on any create+seed failure). The
    // strict seed-failure path is proven by the project-scoped services.
    vi.spyOn(workflowInstanceService, 'startInstanceDeferred').mockRejectedValue(new Error('seed boom (injected)'));

    await expect(createVendorContract(makeInput() as any, testUser.id)).rejects.toThrow();

    const after = await prisma.vendorContract.count({ where: { projectId: testProject.id } });
    expect(after).toBe(before); // no orphan — atomic rollback
    expect(startedHandler).toHaveBeenCalledTimes(0); // nothing emitted on the failed path
  });
});
