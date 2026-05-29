import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@fmksa/db';
import { assertTestDb } from '../helpers/assert-test-db';
import { workflowTemplateService } from '../../src/workflow/templates';
import { workflowInstanceService } from '../../src/workflow';
import * as workflowEvents from '../../src/workflow/events';
import { createFrameworkAgreement } from '../../src/procurement/framework-agreement/service';

/**
 * PIC-80 PB2 — atomic create+autoSeed for framework_agreement (rollback + positive).
 * fw-agreement has a P2002-retry $transaction (sequential agreementNumber) +
 * conditional seed (entity-scoped, projectId nullable). The fix widened that
 * retry-tx to include audit + the conditional seed; this test uses a project-scoped
 * agreement so the seed runs. Self-contained via project-override template.
 */
describe('FrameworkAgreement atomic create+autoSeed (PIC-80)', () => {
  const ts = `fa-atomic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let testUser: { id: string };
  let testRole: { id: string; code: string };
  let testEntity: { id: string };
  let testVendor: { id: string };
  let testProject: { id: string };
  const templateCode = `FA-ATOMIC-TPL-${ts}`;

  beforeAll(async () => {
    assertTestDb();
    testUser = await prisma.user.create({ data: { email: `${ts}@test.com`, name: 'FA Atomic User', passwordHash: 'test-hash', status: 'active' } });
    testRole = await prisma.role.create({ data: { code: `FAA-ROLE-${ts}`, name: 'FA Atomic Role', isSystem: false } });
    await prisma.userRole.create({ data: { userId: testUser.id, roleId: testRole.id, effectiveFrom: new Date('2020-01-01'), assignedBy: testUser.id, assignedAt: new Date() } });
    testEntity = await prisma.entity.create({ data: { code: `ENT-FAA-${ts}`, name: 'FA Atomic Entity', type: 'parent', status: 'active' } });
    testVendor = await prisma.vendor.create({ data: { entityId: testEntity.id, vendorCode: `VEN-FAA-${ts}`, name: `FA Atomic Vendor ${ts}`, status: 'active', createdBy: testUser.id } });
    await prisma.currency.upsert({ where: { code: 'SAR' }, create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 }, update: {} });
    testProject = await prisma.project.create({ data: { code: `PROJ-FAA-${ts}`, name: 'FA Atomic Project', entityId: testEntity.id, currencyCode: 'SAR', startDate: new Date(), createdBy: testUser.id, status: 'active' } });
    await prisma.projectAssignment.create({ data: { projectId: testProject.id, userId: testUser.id, roleId: testRole.id, effectiveFrom: new Date('2020-01-01'), assignedBy: testUser.id, assignedAt: new Date() } });

    const tpl = await workflowTemplateService.createTemplate({
      code: templateCode, name: 'FA Atomic Template', recordType: 'framework_agreement',
      config: { allowComment: true, allowReturn: true, allowOverride: false },
      steps: [{ orderIndex: 1, name: 'Review', approverRule: { type: 'role', roleCode: testRole.code }, slaHours: 24 }],
      createdBy: testUser.id,
    });
    await workflowTemplateService.activateTemplate(tpl.id, testUser.id);
    await prisma.projectSetting.create({ data: { projectId: testProject.id, key: 'workflow_template:framework_agreement', valueJson: templateCode, updatedAt: new Date(), updatedBy: testUser.id } });
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
    // FrameworkAgreement items first (FK), then agreements; AuditLog raw-SQL (append-only).
    const fas = await prisma.frameworkAgreement.findMany({ where: { projectId: testProject.id }, select: { id: true } });
    const faIds = fas.map((f) => f.id);
    if (faIds.length > 0) {
      await prisma.frameworkAgreementItem.deleteMany({ where: { frameworkAgreementId: { in: faIds } } });
    }
    await prisma.frameworkAgreement.deleteMany({ where: { projectId: testProject.id } });
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
    entityId: testEntity.id,
    vendorId: testVendor.id,
    projectId: testProject.id,
    title: `FA ${ts}`,
    validFrom: new Date().toISOString(),
    validTo: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    currency: 'SAR',
    totalCommittedValue: 100000,
  });

  it('positive: persists framework_agreement + workflow_instance and emits workflow.started exactly once', async () => {
    const startedHandler = vi.fn(async (_payload: any) => {});
    workflowEvents.on('workflow.started', startedHandler);

    const record = await createFrameworkAgreement(makeInput() as any, testUser.id);

    const persisted = await prisma.frameworkAgreement.findUnique({ where: { id: record.id } });
    expect(persisted).not.toBeNull();

    const instance = await prisma.workflowInstance.findFirst({ where: { recordType: 'framework_agreement', recordId: record.id } });
    expect(instance).not.toBeNull();
    expect(instance!.status).toBe('in_progress');

    const startedForThis = startedHandler.mock.calls.filter((c) => (c[0] as any)?.recordId === record.id);
    expect(startedForThis.length).toBe(1);
  });

  it('rollback: a create+seed failure leaves no orphan and emits nothing', async () => {
    const before = await prisma.frameworkAgreement.count({ where: { projectId: testProject.id } });
    const startedHandler = vi.fn(async (_payload: any) => {});
    workflowEvents.on('workflow.started', startedHandler);
    // Inject a seed failure (mockRejectedValue = reject on every call, surviving
    // the create's P2002-retry). NOTE: framework_agreement uses a GLOBALLY-unique
    // sequential agreementNumber (findFirst max+1 + retry); under parallel test
    // workers the create itself can P2002 before reaching the seed. We therefore
    // assert the atomicity INVARIANT — any failure in the create+seed transaction
    // leaves no orphan and emits nothing — not a specific error string. The strict
    // seed-failure path is proven deterministically by the project-scoped services
    // (cost-proposal / credit-note / tax-invoice).
    vi.spyOn(workflowInstanceService, 'startInstanceDeferred').mockRejectedValue(new Error('seed boom (injected)'));

    await expect(createFrameworkAgreement(makeInput() as any, testUser.id)).rejects.toThrow();

    const after = await prisma.frameworkAgreement.count({ where: { projectId: testProject.id } });
    expect(after).toBe(before); // no orphan — atomic rollback
    expect(startedHandler).toHaveBeenCalledTimes(0); // nothing emitted on the failed path
  });
});
