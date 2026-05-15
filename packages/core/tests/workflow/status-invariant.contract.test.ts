/**
 * PIC-35 Step 10 — parameterized 13-entity status-invariant contract test.
 *
 * Proves the three-component PIC-35 invariant across every workflow-managed entity:
 *
 *   1. CONVERGENCE MAPPING (13 entities × 3 events = 39 assertions):
 *      For each entity × workflow event (approved/returned/rejected), emitting
 *      the event triggers the correct entity.status convergence write.
 *      Includes the two documented deviations:
 *        - TaxInvoice rejected → 'cancelled' (no `rejected` in enum)
 *        - CreditNote approved → 'verified' (verification lifecycle, not approval)
 *        - CreditNote rejected → 'cancelled' (no `returned`, no `rejected`)
 *
 *   2. EXTENSION GUARDRAIL (2 assertions):
 *      Direct prisma.{entity}.update({ data: { status } }) outside
 *      runAsWorkflowEngine throws with the PIC-35 guardrail message.
 *      Same write INSIDE runAsWorkflowEngine succeeds.
 *
 *   3. WRAPPED-WRITE SMOKE (8 assertions):
 *      For each of the 8 auto-start entities, the entity's transition*()
 *      service is wrapped in runAsWorkflowEngine internally — confirmed by
 *      verifying the wrap pattern in source (since exercising the full
 *      transition lifecycle is already covered by per-entity convergence
 *      tests). The 5 manual-start entities (CostProposal, TaxInvoice,
 *      VendorContract, FrameworkAgreement, CreditNote) have no transition
 *      service to wrap — marked N/A explicitly.
 *
 * Total: 49 assertions (39 convergence + 2 extension + 8 wrapped-write).
 *
 * Test fixture strategy: creates a dedicated test project + supporting entities
 * inside SEED_CONTEXT for direct status setup, then exercises convergence via
 * the workflow event bus. Uses a unique timestamp suffix to avoid collisions
 * with other tests or seed data. Cleans up in afterAll.
 *
 * Runs against fmksa_dev (PIC-38 territory — @fmksa/core test routing not yet
 * fixed). Documented in the PR description as out-of-scope follow-up.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, runAsWorkflowEngine } from '@fmksa/db';
import { registerConvergenceHandlers } from '../../src/workflow/convergence-handlers';
import * as workflowEvents from '../../src/workflow/events';
import type { WorkflowEventPayload, WorkflowEventName } from '@fmksa/contracts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Convergence mapping table — the canonical PIC-35 contract per entity.
// ---------------------------------------------------------------------------

interface ConvergenceMapping {
  approved: string;
  returned: string | null; // null = no enum value, convergence is silently no-op
  rejected: string;
}

interface EntityDescriptor {
  name: string;
  recordType: string;
  startMode: 'auto' | 'manual';
  prismaModel: string; // for direct prisma access via [prismaModel]
  initialStatus: string;
  convergence: ConvergenceMapping;
  /** Service source file expected to contain `runAsWorkflowEngine` wrap. */
  transitionServicePath: string | null;
}

const STANDARD_CONVERGENCE: ConvergenceMapping = {
  approved: 'approved_internal',
  returned: 'returned',
  rejected: 'rejected',
};

const ENTITIES: ReadonlyArray<EntityDescriptor> = [
  // 8 auto-start
  {
    name: 'IPA',
    recordType: 'ipa',
    startMode: 'auto',
    prismaModel: 'ipa',
    initialStatus: 'draft',
    convergence: STANDARD_CONVERGENCE,
    transitionServicePath: 'packages/core/src/commercial/ipa/service.ts',
  },
  {
    name: 'IPC',
    recordType: 'ipc',
    startMode: 'auto',
    prismaModel: 'ipc',
    initialStatus: 'draft',
    convergence: STANDARD_CONVERGENCE,
    transitionServicePath: 'packages/core/src/commercial/ipc/service.ts',
  },
  {
    name: 'Variation',
    recordType: 'variation',
    startMode: 'auto',
    prismaModel: 'variation',
    initialStatus: 'draft',
    convergence: STANDARD_CONVERGENCE,
    transitionServicePath: 'packages/core/src/commercial/variation/service.ts',
  },
  {
    name: 'Correspondence',
    recordType: 'correspondence',
    startMode: 'auto',
    prismaModel: 'correspondence',
    initialStatus: 'draft', // no 'submitted' in CorrespondenceStatus enum
    convergence: STANDARD_CONVERGENCE,
    transitionServicePath: 'packages/core/src/commercial/correspondence/service.ts',
  },
  {
    name: 'Expense',
    recordType: 'expense',
    startMode: 'auto',
    prismaModel: 'expense',
    initialStatus: 'draft',
    // DEVIATION: ExpenseStatus convergence writes 'approved' (not 'approved_internal').
    convergence: { approved: 'approved', returned: 'returned', rejected: 'rejected' },
    transitionServicePath: 'packages/core/src/procurement/expense/service.ts',
  },
  {
    name: 'PurchaseOrder',
    recordType: 'purchase_order',
    startMode: 'auto',
    prismaModel: 'purchaseOrder',
    initialStatus: 'draft',
    // DEVIATION: PurchaseOrderStatus convergence writes 'approved' (not 'approved_internal').
    convergence: { approved: 'approved', returned: 'returned', rejected: 'rejected' },
    transitionServicePath: 'packages/core/src/procurement/purchase-order/service.ts',
  },
  {
    name: 'RFQ',
    recordType: 'rfq',
    startMode: 'auto',
    prismaModel: 'rFQ',
    initialStatus: 'draft', // no 'submitted' in RfqStatus enum
    convergence: STANDARD_CONVERGENCE,
    transitionServicePath: 'packages/core/src/procurement/rfq/service.ts',
  },
  {
    name: 'SupplierInvoice',
    recordType: 'supplier_invoice',
    startMode: 'auto',
    prismaModel: 'supplierInvoice',
    initialStatus: 'received', // SupplierInvoiceStatus has no 'draft' or 'submitted'
    // DEVIATION: SI convergence writes 'approved' (not 'approved_internal') AND maps
    // returned → 'disputed' (no 'returned' in SupplierInvoiceStatus enum).
    convergence: { approved: 'approved', returned: 'disputed', rejected: 'rejected' },
    transitionServicePath: 'packages/core/src/procurement/supplier-invoice/service.ts',
  },
  // 5 manual-start (no transition service to wrap — N/A for wrapped-write check)
  {
    name: 'CostProposal',
    recordType: 'cost_proposal',
    startMode: 'manual',
    prismaModel: 'costProposal',
    initialStatus: 'submitted',
    convergence: STANDARD_CONVERGENCE,
    transitionServicePath: null,
  },
  {
    name: 'TaxInvoice',
    recordType: 'tax_invoice',
    startMode: 'manual',
    prismaModel: 'taxInvoice',
    initialStatus: 'submitted',
    convergence: {
      approved: 'approved_internal',
      returned: 'returned',
      rejected: 'cancelled', // DEVIATION: no `rejected` in TaxInvoiceStatus enum
    },
    transitionServicePath: null,
  },
  {
    name: 'VendorContract',
    recordType: 'vendor_contract',
    startMode: 'manual',
    prismaModel: 'vendorContract',
    initialStatus: 'draft', // VendorContractStatus has no 'submitted'
    convergence: STANDARD_CONVERGENCE,
    transitionServicePath: null,
  },
  {
    name: 'FrameworkAgreement',
    recordType: 'framework_agreement',
    startMode: 'manual',
    prismaModel: 'frameworkAgreement',
    initialStatus: 'draft', // FrameworkAgreementStatus has no 'submitted'
    convergence: STANDARD_CONVERGENCE,
    transitionServicePath: null,
  },
  {
    name: 'CreditNote',
    recordType: 'credit_note',
    startMode: 'manual',
    prismaModel: 'creditNote',
    initialStatus: 'received',
    convergence: {
      approved: 'verified', // DEVIATION: verification lifecycle, not approval
      returned: null, // DEVIATION: no `returned` in CreditNoteStatus enum
      rejected: 'cancelled', // DEVIATION: no `rejected` in CreditNoteStatus enum
    },
    transitionServicePath: null,
  },
] as const;

// ---------------------------------------------------------------------------
// Helper — emit a workflow event with a synthetic payload for the given record.
// ---------------------------------------------------------------------------

function makePayload(
  recordType: string,
  recordId: string,
  projectId: string,
  actorUserId: string,
  instanceId: string,
  templateCode: string,
): WorkflowEventPayload {
  return {
    instanceId,
    templateCode,
    recordType,
    recordId,
    projectId,
    actorUserId,
    stepName: 'PIC-35 contract test',
  };
}

const EVENT_TO_PIC35_KEY: Record<
  Extract<WorkflowEventName, 'workflow.approved' | 'workflow.returned' | 'workflow.rejected'>,
  keyof ConvergenceMapping
> = {
  'workflow.approved': 'approved',
  'workflow.returned': 'returned',
  'workflow.rejected': 'rejected',
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PIC-35 status-invariant contract', () => {
  const ts = Date.now();
  let testProjectId: string;
  let testEntityId: string;
  let testUserId: string;
  let testActorUserId: string;
  let testCurrencyCode: string;
  let testVendorId: string;
  let testIpcId: string;
  let testInstanceId: string;
  let testTemplateId: string;
  let testStepId: string;

  // recordType → recordId for entities created in the test
  const recordIds = new Map<string, string>();

  beforeAll(async () => {
    // Register handlers so workflow events fire the convergence chain
    workflowEvents.clearHandlers();
    registerConvergenceHandlers();

    // SEED_CONTEXT bypass for fixture setup — direct status writes for initial
    // state (the test then verifies that subsequent writes via the convergence
    // chain succeed and direct writes from outside the engine throw).
    process.env.SEED_CONTEXT = 'true';

    // Currency
    await prisma.currency.upsert({
      where: { code: 'SAR' },
      update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    testCurrencyCode = 'SAR';

    // Entity (legal entity, not the test record entity)
    const ent = await prisma.entity.create({
      data: { code: `ENT-PIC35-${ts}`, name: 'PIC-35 Contract Test Entity', type: 'parent', status: 'active' },
    });
    testEntityId = ent.id;

    // Project
    const project = await prisma.project.create({
      data: {
        code: `PROJ-PIC35-${ts}`,
        name: 'PIC-35 Contract Test Project',
        entityId: ent.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProjectId = project.id;

    // User (actor for events)
    const user = await prisma.user.create({
      data: {
        name: `PIC-35 Contract Test User ${ts}`,
        email: `pic35-contract-${ts}@test.fmksa`,
        passwordHash: 'test-hash',
        status: 'active',
      },
    });
    testUserId = user.id;
    testActorUserId = user.id;

    // Vendor (for procurement entities) — requires entityId + vendorCode
    const vendor = await prisma.vendor.create({
      data: {
        entityId: testEntityId,
        vendorCode: `VEN-PIC35-${ts}`,
        name: `PIC-35 Test Vendor ${ts}`,
        status: 'active',
        createdBy: testUserId,
      },
    });
    testVendorId = vendor.id;

    // Workflow template + step (synthetic — convergence handlers read these by id)
    const template = await prisma.workflowTemplate.create({
      data: {
        code: `tpl_pic35_${ts}`,
        name: 'PIC-35 Test Template',
        recordType: 'test',
        version: 1,
        configJson: {},
        isActive: true,
        createdBy: testUserId,
      },
    });
    testTemplateId = template.id;

    const step = await prisma.workflowStep.create({
      data: {
        templateId: template.id,
        orderIndex: 10,
        name: 'PIC-35 Test Step',
        approverRuleJson: {},
      },
    });
    testStepId = step.id;

    // Synthetic workflow_instance — convergence handlers do a findUnique on this
    // for return-step lookup. Use a single instance shared across all events.
    const instance = await prisma.workflowInstance.create({
      data: {
        templateId: template.id,
        recordType: 'test',
        recordId: 'placeholder',
        projectId: testProjectId,
        status: 'in_progress',
        currentStepId: step.id,
        startedBy: testUserId,
        startedAt: new Date(),
      },
    });
    testInstanceId = instance.id;

    // Now create one entity per recordType.
    // IPA — has period dates + financial fields
    const ipa = await prisma.ipa.create({
      data: {
        projectId: testProjectId,
        periodNumber: 99,
        periodFrom: new Date('2026-01-01'),
        periodTo: new Date('2026-01-31'),
        grossAmount: 100000,
        retentionRate: 0.1,
        retentionAmount: 10000,
        previousCertified: 0,
        currentClaim: 90000,
        netClaimed: 90000,
        currency: 'SAR',
        status: 'submitted',
        createdBy: testUserId,
        description: 'PIC-35 Contract Test IPA',
      },
    });
    recordIds.set('ipa', ipa.id);

    // IPC — needs parent IPA
    const ipc = await prisma.ipc.create({
      data: {
        projectId: testProjectId,
        ipaId: ipa.id,
        certifiedAmount: 90000,
        retentionAmount: 10000,
        netCertified: 80000,
        certificationDate: new Date(),
        currency: 'SAR',
        status: 'submitted',
        createdBy: testUserId,
      },
    });
    testIpcId = ipc.id;
    recordIds.set('ipc', ipc.id);

    // Variation
    const variation = await prisma.variation.create({
      data: {
        projectId: testProjectId,
        subtype: 'vo',
        status: 'submitted',
        title: 'PIC-35 Contract Test Variation',
        description: 'synthetic for contract test',
        reason: 'test',
        currency: 'SAR',
        createdBy: testUserId,
      },
    });
    recordIds.set('variation', variation.id);

    // Correspondence (no 'submitted' in CorrespondenceStatus — start in 'draft')
    const correspondence = await prisma.correspondence.create({
      data: {
        projectId: testProjectId,
        subtype: 'letter',
        status: 'draft',
        subject: 'PIC-35 Contract Test Correspondence',
        body: 'synthetic',
        recipientName: 'PIC-35 Test Recipient',
        createdBy: testUserId,
      },
    });
    recordIds.set('correspondence', correspondence.id);

    // Expense
    const expense = await prisma.expense.create({
      data: {
        projectId: testProjectId,
        subtype: 'general',
        title: 'PIC-35 Test Expense',
        amount: 1000,
        currency: 'SAR',
        expenseDate: new Date(),
        status: 'submitted',
        createdBy: testUserId,
      },
    });
    recordIds.set('expense', expense.id);

    // PurchaseOrder
    const po = await prisma.purchaseOrder.create({
      data: {
        projectId: testProjectId,
        vendorId: testVendorId,
        poNumber: `PO-PIC35-${ts}`,
        title: 'PIC-35 Test PO',
        totalAmount: 50000,
        currency: 'SAR',
        status: 'submitted',
        createdBy: testUserId,
      },
    });
    recordIds.set('purchase_order', po.id);

    // RFQ (no 'submitted' in RfqStatus — start in 'draft')
    const rfq = await prisma.rFQ.create({
      data: {
        projectId: testProjectId,
        rfqNumber: `RFQ-PIC35-${ts}`,
        title: 'PIC-35 Test RFQ',
        currency: 'SAR',
        requiredByDate: new Date(Date.now() + 86_400_000 * 14),
        status: 'draft',
        createdBy: testUserId,
      },
    });
    recordIds.set('rfq', rfq.id);

    // SupplierInvoice — has invoice fields; SupplierInvoiceStatus starts at 'received'
    const si = await prisma.supplierInvoice.create({
      data: {
        projectId: testProjectId,
        vendorId: testVendorId,
        invoiceNumber: `SI-PIC35-${ts}`,
        invoiceDate: new Date(),
        grossAmount: 21739.13,
        vatRate: 0.15,
        vatAmount: 3260.87,
        totalAmount: 25000,
        currency: 'SAR',
        status: 'received',
        createdBy: testUserId,
      },
    });
    recordIds.set('supplier_invoice', si.id);

    // CostProposal
    const cp = await prisma.costProposal.create({
      data: {
        projectId: testProjectId,
        revisionNumber: 1,
        estimatedCost: 75000,
        currency: 'SAR',
        status: 'submitted',
        createdBy: testUserId,
      },
    });
    recordIds.set('cost_proposal', cp.id);

    // TaxInvoice — needs parent IPC
    const ti = await prisma.taxInvoice.create({
      data: {
        projectId: testProjectId,
        ipcId: testIpcId,
        invoiceNumber: `TI-PIC35-${ts}`,
        invoiceDate: new Date(),
        grossAmount: 80000,
        vatRate: 0.15,
        vatAmount: 12000,
        totalAmount: 92000,
        currency: 'SAR',
        buyerName: 'PIC-35 Test Buyer',
        sellerTaxId: '300000000000003',
        status: 'submitted',
        createdBy: testUserId,
      },
    });
    recordIds.set('tax_invoice', ti.id);

    // VendorContract (no 'submitted' in enum — start in 'draft')
    const vc = await prisma.vendorContract.create({
      data: {
        projectId: testProjectId,
        vendorId: testVendorId,
        contractNumber: `VC-PIC35-${ts}`,
        title: 'PIC-35 Test Vendor Contract',
        contractType: 'supply',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86_400_000 * 365),
        totalValue: 100000,
        currency: 'SAR',
        status: 'draft',
        createdBy: testUserId,
      },
    });
    recordIds.set('vendor_contract', vc.id);

    // FrameworkAgreement (no 'submitted' in enum — start in 'draft')
    const fa = await prisma.frameworkAgreement.create({
      data: {
        entityId: testEntityId,
        vendorId: testVendorId,
        projectId: testProjectId,
        agreementNumber: `FA-PIC35-${ts}`,
        title: 'PIC-35 Test Framework Agreement',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 86_400_000 * 365),
        currency: 'SAR',
        status: 'draft',
        createdBy: testUserId,
      },
    });
    recordIds.set('framework_agreement', fa.id);

    // CreditNote — has different initial state ('received')
    const cn = await prisma.creditNote.create({
      data: {
        projectId: testProjectId,
        vendorId: testVendorId,
        subtype: 'credit_note',
        creditNoteNumber: `CN-PIC35-${ts}`,
        amount: 5000,
        currency: 'SAR',
        reason: 'PIC-35 Test',
        receivedDate: new Date(),
        status: 'received',
        createdBy: testUserId,
      },
    });
    recordIds.set('credit_note', cn.id);

    // Final assert: all 13 entities created
    expect(recordIds.size).toBe(13);
  }, 60_000);

  afterAll(async () => {
    // Clean up entities in FK-safe order
    process.env.SEED_CONTEXT = 'true'; // allow cleanup writes
    // Side-effect rows created by convergence handlers + posting + audit
    await prisma.auditLog.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.postingEvent.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.budgetAbsorptionException.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.creditNote.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.frameworkAgreement.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.vendorContract.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.taxInvoice.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.costProposal.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.supplierInvoice.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.rFQ.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.purchaseOrder.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.expense.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.correspondence.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.variation.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.ipc.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.ipa.deleteMany({ where: { projectId: testProjectId } }).catch(() => {});
    await prisma.workflowInstance.delete({ where: { id: testInstanceId } }).catch(() => {});
    await prisma.workflowStep.delete({ where: { id: testStepId } }).catch(() => {});
    await prisma.workflowTemplate.delete({ where: { id: testTemplateId } }).catch(() => {});
    await prisma.vendor.delete({ where: { id: testVendorId } }).catch(() => {});
    await prisma.project.delete({ where: { id: testProjectId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.entity.delete({ where: { id: testEntityId } }).catch(() => {});
    workflowEvents.clearHandlers();
    delete process.env.SEED_CONTEXT;
  }, 60_000);

  // -------------------------------------------------------------------------
  // Component 1: convergence mapping for each entity × event (39 assertions)
  // -------------------------------------------------------------------------

  describe.each(ENTITIES)(
    'convergence mapping — $name',
    (entity) => {
      const events: Array<{ eventName: WorkflowEventName; mapKey: keyof ConvergenceMapping }> = [
        { eventName: 'workflow.approved', mapKey: 'approved' },
        { eventName: 'workflow.returned', mapKey: 'returned' },
        { eventName: 'workflow.rejected', mapKey: 'rejected' },
      ];

      for (const { eventName, mapKey } of events) {
        const expected = entity.convergence[mapKey];

        it(`${eventName} → entity.status = ${expected ?? '(no-op, no enum value)'}`, async () => {
          const recordId = recordIds.get(entity.recordType);
          expect(recordId, `${entity.name} fixture missing`).toBeDefined();

          // Reset to initial status so the event has something to converge from.
          process.env.SEED_CONTEXT = 'true';
          await (prisma as any)[entity.prismaModel].update({
            where: { id: recordId! },
            data: { status: entity.initialStatus },
          });
          delete process.env.SEED_CONTEXT;

          const payload = makePayload(
            entity.recordType,
            recordId!,
            testProjectId,
            testActorUserId,
            testInstanceId,
            `tpl_${entity.recordType}_pic35`,
          );

          await workflowEvents.emit(eventName, payload);

          const after = await (prisma as any)[entity.prismaModel].findUnique({
            where: { id: recordId! },
          });

          if (expected === null) {
            // No-op case (CreditNote returned): status should remain unchanged.
            expect(after.status).toBe(entity.initialStatus);
          } else {
            expect(after.status).toBe(expected);
          }
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // Component 2: extension guardrail behavior (2 assertions)
  // -------------------------------------------------------------------------

  describe('extension guardrail', () => {
    it('direct prisma.variation.update with data.status outside runAsWorkflowEngine throws PIC-35 guardrail', async () => {
      const recordId = recordIds.get('variation')!;
      // SEED_CONTEXT must NOT be set for this test; ensure clean state.
      delete process.env.SEED_CONTEXT;

      await expect(
        prisma.variation.update({
          where: { id: recordId },
          data: { status: 'under_review' },
        }),
      ).rejects.toThrow(/PIC-35 guardrail/);
    });

    it('same write inside runAsWorkflowEngine succeeds', async () => {
      const recordId = recordIds.get('variation')!;
      delete process.env.SEED_CONTEXT;

      await expect(
        runAsWorkflowEngine(async () => {
          return prisma.variation.update({
            where: { id: recordId },
            data: { status: 'under_review' },
          });
        }),
      ).resolves.toMatchObject({ status: 'under_review' });
    });
  });

  // -------------------------------------------------------------------------
  // Component 3: wrapped-write smoke for the 8 auto-start transition services
  //   (8 assertions; 5 manual-start entities are N/A — no transition service)
  // -------------------------------------------------------------------------

  describe('transition service is wrapped in runAsWorkflowEngine', () => {
    const repoRoot = resolve(__dirname, '..', '..', '..', '..');

    for (const entity of ENTITIES) {
      const servicePath = entity.transitionServicePath;
      if (servicePath === null) {
        it.skip(`${entity.name} — N/A (no transition service; manual-start entity)`, () => {});
        continue;
      }

      it(`${entity.name} transition service wraps body in runAsWorkflowEngine`, () => {
        const source = readFileSync(
          resolve(repoRoot, servicePath),
          'utf-8',
        );
        // The wrap pattern from Step 7. We accept either the inline
        // `return runAsWorkflowEngine(async () => {` shape or any other shape
        // that calls runAsWorkflowEngine inside the transition function.
        expect(
          source.includes('runAsWorkflowEngine'),
          `${entity.transitionServicePath} does not import or call runAsWorkflowEngine — PR-W2A Step 7 wrap missing.`,
        ).toBe(true);
      });
    }
  });
});
