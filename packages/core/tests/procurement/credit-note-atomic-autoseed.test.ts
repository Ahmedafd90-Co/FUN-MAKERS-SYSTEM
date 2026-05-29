import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@fmksa/db';
import { assertTestDb } from '../helpers/assert-test-db';
import { workflowTemplateService } from '../../src/workflow/templates';
import { workflowInstanceService } from '../../src/workflow';
import * as workflowEvents from '../../src/workflow/events';
import { createCreditNote } from '../../src/procurement/credit-note/service';

/**
 * PIC-80 PB2 — atomic create+autoSeed for credit_note (rollback + positive).
 * Same ratified pattern as cost-proposal. Extension-on-tx is a property of the
 * shared engine path (proven in PB1) and is NOT re-run per service.
 * Self-contained template via project-override (cluster-4 genuine-validation).
 */
describe('CreditNote atomic create+autoSeed (PIC-80)', () => {
  const ts = `cn-atomic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let testUser: { id: string };
  let testRole: { id: string; code: string };
  let testEntity: { id: string };
  let testVendor: { id: string };
  let testProject: { id: string };
  const templateCode = `CN-ATOMIC-TPL-${ts}`;

  beforeAll(async () => {
    assertTestDb();
    testUser = await prisma.user.create({ data: { email: `${ts}@test.com`, name: 'CN Atomic User', passwordHash: 'test-hash', status: 'active' } });
    testRole = await prisma.role.create({ data: { code: `CNA-ROLE-${ts}`, name: 'CN Atomic Role', isSystem: false } });
    await prisma.userRole.create({ data: { userId: testUser.id, roleId: testRole.id, effectiveFrom: new Date('2020-01-01'), assignedBy: testUser.id, assignedAt: new Date() } });
    testEntity = await prisma.entity.create({ data: { code: `ENT-CNA-${ts}`, name: 'CN Atomic Entity', type: 'parent', status: 'active' } });
    testVendor = await prisma.vendor.create({ data: { entityId: testEntity.id, vendorCode: `VEN-CNA-${ts}`, name: `CN Atomic Vendor ${ts}`, status: 'active', createdBy: testUser.id } });
    await prisma.currency.upsert({ where: { code: 'SAR' }, create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 }, update: {} });
    testProject = await prisma.project.create({ data: { code: `PROJ-CNA-${ts}`, name: 'CN Atomic Project', entityId: testEntity.id, currencyCode: 'SAR', startDate: new Date(), createdBy: testUser.id, status: 'active' } });
    await prisma.projectAssignment.create({ data: { projectId: testProject.id, userId: testUser.id, roleId: testRole.id, effectiveFrom: new Date('2020-01-01'), assignedBy: testUser.id, assignedAt: new Date() } });

    const tpl = await workflowTemplateService.createTemplate({
      code: templateCode, name: 'CN Atomic Template', recordType: 'credit_note',
      config: { allowComment: true, allowReturn: true, allowOverride: false },
      steps: [{ orderIndex: 1, name: 'Review', approverRule: { type: 'role', roleCode: testRole.code }, slaHours: 24 }],
      createdBy: testUser.id,
    });
    await workflowTemplateService.activateTemplate(tpl.id, testUser.id);
    await prisma.projectSetting.create({ data: { projectId: testProject.id, key: 'workflow_template:credit_note', valueJson: templateCode, updatedAt: new Date(), updatedBy: testUser.id } });
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
    await prisma.creditNote.deleteMany({ where: { projectId: testProject.id } });
    // AuditLog is append-only → raw SQL bypass (PB1 lesson).
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
    subtype: 'credit_note',
    creditNoteNumber: `CN-${ts}-${Math.random().toString(36).slice(2, 6)}`,
    amount: 5000,
    currency: 'SAR',
    reason: 'Overcharge correction',
    receivedDate: new Date().toISOString(),
  });

  it('positive: persists credit_note + workflow_instance and emits workflow.started exactly once', async () => {
    const startedHandler = vi.fn(async () => {});
    workflowEvents.on('workflow.started', startedHandler);

    const record = await createCreditNote(makeInput(), testUser.id);

    const persisted = await prisma.creditNote.findUnique({ where: { id: record.id } });
    expect(persisted).not.toBeNull();

    const instance = await prisma.workflowInstance.findFirst({ where: { recordType: 'credit_note', recordId: record.id } });
    expect(instance).not.toBeNull();
    expect(instance!.status).toBe('in_progress');

    expect(startedHandler).toHaveBeenCalledTimes(1);
  });

  it('rollback: workflow-seed failure rolls back the credit_note create and emits nothing', async () => {
    const before = await prisma.creditNote.count({ where: { projectId: testProject.id } });
    const startedHandler = vi.fn(async () => {});
    workflowEvents.on('workflow.started', startedHandler);
    const seedSpy = vi.spyOn(workflowInstanceService, 'startInstanceDeferred').mockRejectedValueOnce(new Error('seed boom (injected)'));

    await expect(createCreditNote(makeInput(), testUser.id)).rejects.toThrow(/seed boom/);

    const after = await prisma.creditNote.count({ where: { projectId: testProject.id } });
    expect(after).toBe(before);
    expect(seedSpy).toHaveBeenCalledTimes(1);
    expect(startedHandler).toHaveBeenCalledTimes(0);
  });
});
