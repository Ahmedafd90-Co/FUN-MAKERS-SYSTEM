import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma, SINGLETON_ORG_ID } from '@fmksa/db';
import * as workflowEvents from '../../src/workflow/events';
import {
  createTaxInvoice,
  transitionTaxInvoice,
  getTaxInvoice,
  listTaxInvoices,
  deleteTaxInvoice,
} from '../../src/commercial/tax-invoice/service';
import { createIpa, transitionIpa } from '../../src/commercial/ipa/service';
import { createIpc, transitionIpc } from '../../src/commercial/ipc/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';
import {
  workflowInstanceService,
  workflowStepService,
  registerConvergenceHandlers,
} from '../../src/workflow';

/**
 * PIC-78 α-rewrite (2026-05-28):
 *
 * The beforeAll parent IPA→IPC chain is driven via the workflow engine
 * (workflowStepService) instead of transitionIpa/transitionIpc review/approve,
 * which are refused post-8656e57. submit (auto-start) + IPC sign remain
 * transition calls. TaxInvoice's own transitions are NOT workflow-managed and
 * are unchanged. Templates stay ACTIVE (legacy deactivation dropped).
 *
 * driveWorkflow(recordType, recordId) is generic + role-keyed off
 * step.approverRuleJson.roleCode.
 */

const ROLES_NEEDED = [
  'qs_commercial',
  'project_manager',
  'contracts_manager',
  'finance',
  'project_director',
  'document_controller',
] as const;

describe('TaxInvoice Service', () => {
  let testProject: { id: string; code: string; entityId: string };
  let signedIpc: { id: string };
  const ts = Date.now();
  /** Map from role code → userId created for this test's project */
  const roleUsers: Record<string, string> = {};

  /**
   * α-helper: drive a workflow (ipa/ipc) through ALL steps via the engine →
   * approved_internal converges. Role-keyed off step.approverRuleJson.roleCode.
   */
  async function driveWorkflow(recordType: string, recordId: string) {
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
        comment: `α-rewrite: ${step.name}`,
      });
    }
  }

  beforeAll(async () => {
    registerCommercialEventTypes();
    registerConvergenceHandlers();

    const entity = await prisma.entity.create({
      data: { orgId: SINGLETON_ORG_ID, code: `ENT-TI-${ts}`, name: 'TaxInvoice Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `PROJ-TI-${ts}`, name: 'TaxInvoice Test', entityId: entity.id,
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
          email: `test-ti-${roleCode}-${ts}@test.com`,
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

    // Create IPA and drive to approved_internal via the workflow engine
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
    }, 'test-user');

    await transitionIpa(ipa.id, 'submit', 'test-user'); // auto-starts IPA workflow
    await driveWorkflow('ipa', ipa.id); // → approved_internal converges

    // Create IPC and drive to signed (workflow → approved_internal, then sign)
    const ipc = await createIpc({
      projectId: testProject.id,
      ipaId: ipa.id,
      certifiedAmount: 80000,
      retentionAmount: 8000,
      netCertified: 72000,
      certificationDate: new Date().toISOString(),
      currency: 'SAR',
    }, 'test-user');

    await transitionIpc(ipc.id, 'submit', 'test-user'); // auto-starts IPC workflow
    await driveWorkflow('ipc', ipc.id); // → approved_internal converges
    await transitionIpc(ipc.id, 'sign', 'test-user');
    signedIpc = { id: ipc.id };
  });

  afterAll(async () => {
    // Clear the workflow FK chain. workflow_actions is APPEND-ONLY (deleteMany
    // blocked by middleware) → raw SQL.
    await (prisma as any).$executeRawUnsafe(
      `DELETE FROM workflow_actions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE project_id = '${testProject.id}')`,
    );
    await prisma.workflowInstance.deleteMany({ where: { projectId: testProject.id } });
  });

  const makeInput = (overrides = {}) => ({
    projectId: testProject.id,
    ipcId: signedIpc.id,
    invoiceNumber: 'IGNORED', // auto-generated, this value is overridden
    invoiceDate: new Date().toISOString(),
    grossAmount: 80000,
    vatRate: 0.15,
    vatAmount: 12000,
    totalAmount: 92000,
    currency: 'SAR',
    buyerName: 'Test Buyer',
    buyerTaxId: '300000000000003',
    sellerTaxId: '300000000000001',
    ...overrides,
  });

  it('cannot create TaxInvoice if parent IPC is in draft status', async () => {
    // Create a new IPA -> approved, IPC -> stays in draft
    const ipa2 = await createIpa({
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

    await transitionIpa(ipa2.id, 'submit', 'test-user'); // auto-starts IPA workflow
    await driveWorkflow('ipa', ipa2.id); // → approved_internal converges

    const draftIpc = await createIpc({
      projectId: testProject.id,
      ipaId: ipa2.id,
      certifiedAmount: 40000,
      retentionAmount: 4000,
      netCertified: 36000,
      certificationDate: new Date().toISOString(),
      currency: 'SAR',
    }, 'test-user');

    await expect(
      createTaxInvoice(makeInput({ ipcId: draftIpc.id }), 'test-user'),
    ).rejects.toThrow(/parent IPC is in 'draft' status/);
  });

  it('can create TaxInvoice when parent IPC is signed', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    expect(inv).toBeTruthy();
    expect(inv.ipcId).toBe(signedIpc.id);
    expect(inv.status).toBe('draft');
  });

  it('create assigns invoiceNumber automatically', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    expect(inv.invoiceNumber).toMatch(new RegExp(`^${testProject.code}-INVNUM-\\d{3}$`));
  });

  it('full lifecycle: draft -> under_review -> approved_internal -> issued -> submitted -> collected', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await transitionTaxInvoice(inv.id, 'submit', 'test-user');
    await transitionTaxInvoice(inv.id, 'approve', 'test-user');
    await transitionTaxInvoice(inv.id, 'issue', 'test-user');
    await transitionTaxInvoice(inv.id, 'mark_submitted', 'test-user');
    const collected = await transitionTaxInvoice(inv.id, 'mark_collected', 'test-user');
    expect(collected.status).toBe('collected');
  });

  it('TAX_INVOICE_ISSUED posting fires at issued', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await transitionTaxInvoice(inv.id, 'submit', 'test-user');
    await transitionTaxInvoice(inv.id, 'approve', 'test-user');
    await transitionTaxInvoice(inv.id, 'issue', 'test-user');

    const postingEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: inv.id, eventType: 'TAX_INVOICE_ISSUED' },
    });
    expect(postingEvent).toBeTruthy();
  });

  it('reference number assigned at issued (INV type code)', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await transitionTaxInvoice(inv.id, 'submit', 'test-user');
    await transitionTaxInvoice(inv.id, 'approve', 'test-user');
    const issued = await transitionTaxInvoice(inv.id, 'issue', 'test-user');
    expect(issued.status).toBe('issued');
    expect(issued.referenceNumber).toMatch(new RegExp(`^${testProject.code}-INV-\\d{3}$`));
  });

  it('post-issuance transitions work (overdue, partially_collected, etc.)', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await transitionTaxInvoice(inv.id, 'submit', 'test-user');
    await transitionTaxInvoice(inv.id, 'approve', 'test-user');
    await transitionTaxInvoice(inv.id, 'issue', 'test-user');
    const overdue = await transitionTaxInvoice(inv.id, 'mark_overdue', 'test-user');
    expect(overdue.status).toBe('overdue');
    const partial = await transitionTaxInvoice(inv.id, 'mark_partially_collected', 'test-user');
    expect(partial.status).toBe('partially_collected');
    const collected = await transitionTaxInvoice(inv.id, 'mark_collected', 'test-user');
    expect(collected.status).toBe('collected');
  });

  it('terminal status cannot be transitioned', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await transitionTaxInvoice(inv.id, 'submit', 'test-user');
    await transitionTaxInvoice(inv.id, 'approve', 'test-user');
    await transitionTaxInvoice(inv.id, 'issue', 'test-user');
    await transitionTaxInvoice(inv.id, 'mark_submitted', 'test-user');
    await transitionTaxInvoice(inv.id, 'mark_collected', 'test-user');
    await expect(transitionTaxInvoice(inv.id, 'mark_overdue', 'test-user')).rejects.toThrow(/terminal status/);
  });

  it('delete only in draft', async () => {
    const inv = await createTaxInvoice(makeInput(), 'test-user');
    await deleteTaxInvoice(inv.id, 'test-user', testProject.id);
    const deleted = await prisma.taxInvoice.findUnique({ where: { id: inv.id } });
    expect(deleted).toBeNull();
  });

  it('list with filters', async () => {
    // Create a couple of invoices for listing
    await createTaxInvoice(makeInput(), 'test-user');
    await createTaxInvoice(makeInput(), 'test-user');

    const result = await listTaxInvoices({
      projectId: testProject.id,
      statusFilter: ['draft'],
      skip: 0, take: 20, sortDirection: 'desc',
    });
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.total).toBeGreaterThanOrEqual(1);
    for (const item of result.items) {
      expect(item.status).toBe('draft');
    }
  });

  // ---------------------------------------------------------------------------
  // PIC-80 — atomic create + autoSeed (rollback + positive). Reuses the signed
  // IPC + project from beforeAll. Extension-on-tx is a shared-engine property
  // proven in PB1; not re-run per service. Handler calls are filtered by
  // recordId so the file's convergence/posting handlers are left intact.
  // ---------------------------------------------------------------------------

  it('PIC-80 positive: create persists tax_invoice + workflow_instance and emits workflow.started exactly once', async () => {
    const startedHandler = vi.fn(async (_payload: any) => {});
    workflowEvents.on('workflow.started', startedHandler);

    const inv = await createTaxInvoice(makeInput(), 'test-user');

    const persisted = await prisma.taxInvoice.findUnique({ where: { id: inv.id } });
    expect(persisted).not.toBeNull();

    const instance = await prisma.workflowInstance.findFirst({ where: { recordType: 'tax_invoice', recordId: inv.id } });
    expect(instance).not.toBeNull();
    expect(instance!.status).toBe('in_progress');

    const startedForThis = startedHandler.mock.calls.filter((c) => (c[0] as any)?.recordId === inv.id);
    expect(startedForThis.length).toBe(1); // deferral didn't drop it; no double-emit
  });

  it('PIC-80 rollback: workflow-seed failure rolls back the tax_invoice create and emits nothing', async () => {
    const before = await prisma.taxInvoice.count({ where: { projectId: testProject.id } });
    const startedHandler = vi.fn(async (_payload: any) => {});
    workflowEvents.on('workflow.started', startedHandler);
    const seedSpy = vi
      .spyOn(workflowInstanceService, 'startInstanceDeferred')
      .mockRejectedValueOnce(new Error('seed boom (injected)'));

    try {
      await expect(createTaxInvoice(makeInput(), 'test-user')).rejects.toThrow(/seed boom/);

      const after = await prisma.taxInvoice.count({ where: { projectId: testProject.id } });
      expect(after).toBe(before); // refnum + create rolled back — no orphan
      expect(seedSpy).toHaveBeenCalledTimes(1);
      expect(startedHandler).toHaveBeenCalledTimes(0); // nothing emitted on the failed path
    } finally {
      seedSpy.mockRestore();
    }
  });
});
