import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, SINGLETON_ORG_ID } from '@fmksa/db';
import { createIpa, transitionIpa } from '../../src/commercial/ipa/service';
import { createIpc, transitionIpc } from '../../src/commercial/ipc/service';
import { createVariation, transitionVariation } from '../../src/commercial/variation/service';
import { createCostProposal, transitionCostProposal } from '../../src/commercial/cost-proposal/service';
import { createTaxInvoice, transitionTaxInvoice } from '../../src/commercial/tax-invoice/service';
import { createCorrespondence, transitionCorrespondence } from '../../src/commercial/correspondence/service';
import { getCommercialDashboard } from '../../src/commercial/dashboard/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';
import {
  workflowInstanceService,
  workflowStepService,
  registerConvergenceHandlers,
} from '../../src/workflow';

/**
 * PIC-78 α-rewrite (2026-05-28):
 *
 * Workflow-managed actions (review/approve/reject/return) across IPA, IPC,
 * Variation and Correspondence are driven via the workflow engine
 * (workflowStepService) instead of transitionXxx, which refuses them
 * unconditionally post-8656e57. submit (auto-starts workflow) and post-workflow
 * lifecycle transitions (sign / issue / client_pending / client_approved /
 * close) remain transitionXxx calls — non-WMA, self-wrap via runAsWorkflowEngine.
 * TaxInvoice and CostProposal are NOT workflow-managed — their transitions are
 * unchanged.
 *
 * Templates stay ACTIVE (legacy deactivation pattern dropped). Role users +
 * project assignments created for all 6 commercial approver roles on BOTH
 * testProject and the per-test refProject (Test 8) so approver resolution
 * succeeds for workflow steps.
 *
 * driveWorkflow(recordType, recordId) is generic + role-keyed off
 * step.approverRuleJson.roleCode — drives every commercial template uniformly.
 *
 * Test 2 SPLIT (PD ruling): 2a keeps the 2 posting-event assertions via the
 * workflow path; 2b (assessment fields) it.skip pending PIC-79. Test 10
 * it.skip pending PIC-79 (assessment-data-via-transition orphaned by 8656e57).
 */

const ROLES_NEEDED = [
  'qs_commercial',
  'project_manager',
  'contracts_manager',
  'finance',
  'project_director',
  'document_controller',
] as const;

describe('Commercial Lifecycle Integration', () => {
  let testProject: { id: string; code: string; entityId: string };
  const ts = Date.now();
  /** Map from role code → userId created for this test's testProject */
  const roleUsers: Record<string, string> = {};
  /** refProject ids needing workflow FK cleanup (Test 8 creates its own project) */
  const refProjectIds: string[] = [];

  /** Create role users + a userRole + a projectAssignment for each commercial
   * approver role against the given project. Returns the role→userId map (for
   * testProject this populates the shared `roleUsers`; secondary projects reuse
   * the same users and only add projectAssignments). */
  async function ensureRoleUsers(projectId: string, label: string): Promise<void> {
    for (const roleCode of ROLES_NEEDED) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new Error(`Role '${roleCode}' not found — run seed first`);
      let userId = roleUsers[roleCode];
      if (!userId) {
        const user = await prisma.user.create({
          data: {
            orgId: SINGLETON_ORG_ID,
            name: `Test ${roleCode} ${ts}`,
            email: `test-int-${roleCode}-${ts}@test.com`,
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
        roleUsers[roleCode] = user.id;
        userId = user.id;
      }
      await prisma.projectAssignment.create({
        data: {
          userId, projectId, roleId: role.id,
          effectiveFrom: new Date('2020-01-01'),
          assignedBy: `test-setup-${label}`,
          assignedAt: new Date(),
        },
      });
    }
  }

  /**
   * α-helper: drive a workflow (ipa/ipc/variation/correspondence) through ALL
   * steps via the engine → approved_internal converges. Role-keyed off
   * step.approverRuleJson.roleCode (template-agnostic).
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
      data: { orgId: SINGLETON_ORG_ID, code: `ENT-INT-${ts}`, name: 'Integration Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' },
      update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `PROJ-INT-${ts}`,
        name: 'Integration Test',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    testProject = { id: project.id, code: project.code, entityId: entity.id };

    // Role users + project assignments for all commercial approver roles
    await ensureRoleUsers(testProject.id, 'main');
  });

  afterAll(async () => {
    // Clear the workflow FK chain before any project teardown. workflow_actions
    // is APPEND-ONLY (prisma.workflowAction.deleteMany is blocked by middleware),
    // so delete via raw SQL. Covers testProject + every refProject (Test 8/12).
    const projectIds = [testProject.id, ...refProjectIds];
    for (const pid of projectIds) {
      await (prisma as any).$executeRawUnsafe(
        `DELETE FROM workflow_actions WHERE instance_id IN (SELECT id FROM workflow_instances WHERE project_id = '${pid}')`,
      );
      await prisma.workflowInstance.deleteMany({ where: { projectId: pid } });
    }
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  let ipaCounter = 0;
  const makeIpaInput = (overrides = {}) => ({
    projectId: testProject.id,
    periodNumber: ++ipaCounter,
    periodFrom: new Date().toISOString(),
    periodTo: new Date().toISOString(),
    grossAmount: 100000,
    retentionRate: 0.1,
    retentionAmount: 10000,
    previousCertified: 0,
    currentClaim: 90000,
    netClaimed: 90000,
    currency: 'SAR',
    ...overrides,
  });

  const makeIpcInput = (ipaId: string, overrides = {}) => ({
    projectId: testProject.id,
    ipaId,
    certifiedAmount: 80000,
    retentionAmount: 8000,
    netCertified: 72000,
    certificationDate: new Date().toISOString(),
    currency: 'SAR',
    ...overrides,
  });

  const makeTaxInvoiceInput = (ipcId: string, overrides = {}) => ({
    projectId: testProject.id,
    ipcId,
    invoiceNumber: 'IGNORED',
    invoiceDate: new Date().toISOString(),
    grossAmount: 72000,
    vatRate: 0.15,
    vatAmount: 10800,
    totalAmount: 82800,
    currency: 'SAR',
    buyerName: 'Test Buyer',
    sellerTaxId: '300000000000003',
    ...overrides,
  });

  // ---------------------------------------------------------------------------
  // Test 1: Full IPA -> IPC -> TaxInvoice chain with posting events
  // ---------------------------------------------------------------------------

  it('Test 1: IPA -> IPC -> TaxInvoice chain fires 3 posting events', async () => {
    // IPA: create -> submit -> (workflow) -> approved_internal (fires IPA_APPROVED)
    const ipa = await createIpa(makeIpaInput(), 'test-user');
    await transitionIpa(ipa.id, 'submit', 'test-user'); // auto-starts IPA workflow
    await driveWorkflow('ipa', ipa.id); // → approved_internal converges

    // IPC: create(ipaId) -> submit -> (workflow) -> approved_internal -> sign (fires IPC_SIGNED)
    const ipc = await createIpc(makeIpcInput(ipa.id), 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user'); // auto-starts IPC workflow
    await driveWorkflow('ipc', ipc.id); // → approved_internal converges
    await transitionIpc(ipc.id, 'sign', 'test-user');

    // TaxInvoice: create(ipcId) -> submit -> approve -> issue (fires TAX_INVOICE_ISSUED)
    const ti = await createTaxInvoice(makeTaxInvoiceInput(ipc.id), 'test-user');
    await transitionTaxInvoice(ti.id, 'submit', 'test-user');
    await transitionTaxInvoice(ti.id, 'approve', 'test-user');
    await transitionTaxInvoice(ti.id, 'issue', 'test-user');

    // Verify 3 posting events exist with correct eventTypes
    const ipaEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: ipa.id, eventType: 'IPA_APPROVED' },
    });
    expect(ipaEvent).toBeTruthy();
    expect(ipaEvent!.status).toBe('posted');
    // Amounts serialized as strings
    const ipaPayload = ipaEvent!.payloadJson as Record<string, unknown>;
    expect(ipaPayload.grossAmount).toBe('100000');
    expect(ipaPayload.netClaimed).toBe('90000');

    const ipcEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: ipc.id, eventType: 'IPC_SIGNED' },
    });
    expect(ipcEvent).toBeTruthy();
    expect(ipcEvent!.status).toBe('posted');
    const ipcPayload = ipcEvent!.payloadJson as Record<string, unknown>;
    expect(ipcPayload.certifiedAmount).toBe('80000');
    expect(ipcPayload.netCertified).toBe('72000');

    const tiEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: ti.id, eventType: 'TAX_INVOICE_ISSUED' },
    });
    expect(tiEvent).toBeTruthy();
    expect(tiEvent!.status).toBe('posted');
    const tiPayload = tiEvent!.payloadJson as Record<string, unknown>;
    expect(tiPayload.totalAmount).toBe('82800');
  });

  // ---------------------------------------------------------------------------
  // Test 2: Variation (VO) lifecycle with client approval posting
  // ---------------------------------------------------------------------------

  it('Test 2a: VO lifecycle fires VARIATION_APPROVED_INTERNAL and VARIATION_APPROVED_CLIENT', async () => {
    const vo = await createVariation({
      projectId: testProject.id,
      subtype: 'vo',
      title: 'Test VO Integration',
      description: 'VO for integration test',
      reason: 'Scope change',
      costImpact: 60000,
      currency: 'SAR',
    }, 'test-user');

    // submit -> (workflow) -> approved_internal (fires VARIATION_APPROVED_INTERNAL)
    await transitionVariation(vo.id, 'submit', 'test-user'); // auto-starts workflow
    await driveWorkflow('variation', vo.id); // → approved_internal converges

    // sign -> issue -> client_pending -> client_approved (fires VARIATION_APPROVED_CLIENT)
    await transitionVariation(vo.id, 'sign', 'test-user');
    await transitionVariation(vo.id, 'issue', 'test-user');
    await transitionVariation(vo.id, 'client_pending', 'test-user');
    await transitionVariation(vo.id, 'client_approved', 'test-user');

    // Verify 2 posting events
    const internalEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: vo.id, eventType: 'VARIATION_APPROVED_INTERNAL' },
    });
    expect(internalEvent).toBeTruthy();

    const clientEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: vo.id, eventType: 'VARIATION_APPROVED_CLIENT' },
    });
    expect(clientEvent).toBeTruthy();
  });

  // SKIP pending PIC-79: assessment-data-via-transition orphaned by 8656e57
  // (review/approve now workflow-managed). See PIC-79.
  it.skip('Test 2b: VO assessment fields populated on review and approve [PIC-79-ORPHAN]', async () => {
    const vo = await createVariation({
      projectId: testProject.id,
      subtype: 'vo',
      title: 'Test VO Integration',
      description: 'VO for integration test',
      reason: 'Scope change',
      costImpact: 60000,
      currency: 'SAR',
    }, 'test-user');

    // submit -> review (with assessedCostImpact) -> approve (with approvedCostImpact, fires VARIATION_APPROVED_INTERNAL)
    await transitionVariation(vo.id, 'submit', 'test-user');
    await transitionVariation(vo.id, 'review', 'test-user', undefined, {
      assessedCostImpact: 55000,
      assessedTimeImpactDays: 10,
    });
    await transitionVariation(vo.id, 'approve', 'test-user', undefined, {
      approvedCostImpact: 50000,
      approvedTimeImpactDays: 8,
    });

    // sign -> issue -> client_pending -> client_approved (fires VARIATION_APPROVED_CLIENT)
    await transitionVariation(vo.id, 'sign', 'test-user');
    await transitionVariation(vo.id, 'issue', 'test-user');
    await transitionVariation(vo.id, 'client_pending', 'test-user');
    await transitionVariation(vo.id, 'client_approved', 'test-user');

    // Verify 2 posting events
    const internalEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: vo.id, eventType: 'VARIATION_APPROVED_INTERNAL' },
    });
    expect(internalEvent).toBeTruthy();

    const clientEvent = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: vo.id, eventType: 'VARIATION_APPROVED_CLIENT' },
    });
    expect(clientEvent).toBeTruthy();

    // Verify assessment fields are populated in the DB record
    const voRecord = await prisma.variation.findUniqueOrThrow({ where: { id: vo.id } });
    expect(Number(voRecord.assessedCostImpact)).toBe(55000);
    expect(voRecord.assessedTimeImpactDays).toBe(10);
    expect(Number(voRecord.approvedCostImpact)).toBe(50000);
    expect(voRecord.approvedTimeImpactDays).toBe(8);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Claim correspondence -> issued fires CLAIM_ISSUED
  // ---------------------------------------------------------------------------

  it('Test 3: Claim correspondence issued fires CLAIM_ISSUED', async () => {
    const claim = await createCorrespondence({
      projectId: testProject.id,
      subtype: 'claim',
      subject: 'Test Claim Integration',
      body: 'Claim body',
      recipientName: 'Client',
      claimType: 'additional_cost',
      claimedAmount: 75000,
      claimedTimeDays: 30,
      currency: 'SAR',
    }, 'test-user');

    // submit -> (workflow) -> approved_internal -> sign -> issue (fires CLAIM_ISSUED)
    await transitionCorrespondence(claim.id, 'submit', 'test-user'); // auto-starts workflow
    await driveWorkflow('correspondence', claim.id); // → approved_internal converges
    await transitionCorrespondence(claim.id, 'sign', 'test-user');
    await transitionCorrespondence(claim.id, 'issue', 'test-user');

    const event = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: claim.id, eventType: 'CLAIM_ISSUED' },
    });
    expect(event).toBeTruthy();

    const payload = event!.payloadJson as Record<string, unknown>;
    expect(payload.correspondenceId).toBe(claim.id);
    expect(payload.claimType).toBe('additional_cost');
    expect(payload.claimedAmount).toBe('75000');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Back charge correspondence -> issued fires BACK_CHARGE_ISSUED
  // ---------------------------------------------------------------------------

  it('Test 4: Back charge correspondence issued fires BACK_CHARGE_ISSUED', async () => {
    const bc = await createCorrespondence({
      projectId: testProject.id,
      subtype: 'back_charge',
      subject: 'Test Back Charge Integration',
      body: 'Back charge body',
      recipientName: 'Subcontractor',
      targetName: 'Sub Corp',
      category: 'defect',
      chargedAmount: 25000,
      currency: 'SAR',
    }, 'test-user');

    // submit -> (workflow) -> approved_internal -> sign -> issue (fires BACK_CHARGE_ISSUED)
    await transitionCorrespondence(bc.id, 'submit', 'test-user'); // auto-starts workflow
    await driveWorkflow('correspondence', bc.id); // → approved_internal converges
    await transitionCorrespondence(bc.id, 'sign', 'test-user');
    await transitionCorrespondence(bc.id, 'issue', 'test-user');

    const event = await prisma.postingEvent.findFirst({
      where: { sourceRecordId: bc.id, eventType: 'BACK_CHARGE_ISSUED' },
    });
    expect(event).toBeTruthy();

    const payload = event!.payloadJson as Record<string, unknown>;
    expect(payload.correspondenceId).toBe(bc.id);
    expect(payload.targetName).toBe('Sub Corp');
    expect(payload.chargedAmount).toBe('25000');
  });

  // ---------------------------------------------------------------------------
  // Test 5: IPC creation gated on approved IPA
  // ---------------------------------------------------------------------------

  it('Test 5: IPC creation rejects when parent IPA is still in draft', async () => {
    const draftIpa = await createIpa(makeIpaInput(), 'test-user');
    // IPA stays in draft — createIpc should throw
    await expect(
      createIpc(makeIpcInput(draftIpa.id), 'test-user'),
    ).rejects.toThrow(/parent IPA is in 'draft' status/);
  });

  // ---------------------------------------------------------------------------
  // Test 6: TaxInvoice creation gated on signed IPC
  // ---------------------------------------------------------------------------

  it('Test 6: TaxInvoice creation rejects when parent IPC is still in draft', async () => {
    // Need an approved IPA first to create an IPC
    const ipa = await createIpa(makeIpaInput(), 'test-user');
    await transitionIpa(ipa.id, 'submit', 'test-user'); // auto-starts IPA workflow
    await driveWorkflow('ipa', ipa.id); // → approved_internal converges

    // IPC stays in draft — createTaxInvoice should throw
    const draftIpc = await createIpc(makeIpcInput(ipa.id), 'test-user');
    await expect(
      createTaxInvoice(makeTaxInvoiceInput(draftIpc.id), 'test-user'),
    ).rejects.toThrow(/parent IPC is in 'draft' status/);
  });

  // ---------------------------------------------------------------------------
  // Test 7: Change order cannot enter client_pending
  // ---------------------------------------------------------------------------

  it('Test 7: Change order cannot transition to client_pending', async () => {
    const co = await createVariation({
      projectId: testProject.id,
      subtype: 'change_order',
      title: 'Test CO Integration',
      description: 'CO for integration test',
      reason: 'Contract adjustment',
      costImpact: 30000,
      currency: 'SAR',
    }, 'test-user');

    // Full lifecycle to issued (workflow-driven approval)
    await transitionVariation(co.id, 'submit', 'test-user'); // auto-starts workflow
    await driveWorkflow('variation', co.id); // → approved_internal converges
    await transitionVariation(co.id, 'sign', 'test-user');
    await transitionVariation(co.id, 'issue', 'test-user');

    // Try transition to client_pending — should throw "Invalid"
    await expect(
      transitionVariation(co.id, 'client_pending', 'test-user'),
    ).rejects.toThrow(/Invalid/);
  });

  // ---------------------------------------------------------------------------
  // Test 8: Reference numbers sequential and unique
  // ---------------------------------------------------------------------------

  it('Test 8: Reference numbers are sequential and follow PROJ-CODE-IPA-NNN pattern', async () => {
    // Create a dedicated project so reference counters start fresh
    const entity = await prisma.entity.create({
      data: { orgId: SINGLETON_ORG_ID, code: `ENT-REF-${ts}`, name: 'Ref Test Entity', type: 'parent', status: 'active' },
    });
    const refProject = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `PROJ-REF-${ts}`,
        name: 'Ref Test',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    refProjectIds.push(refProject.id);
    // Workflow approver resolution checks this project's assignments.
    await ensureRoleUsers(refProject.id, 'ref');

    const refNumbers: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const ipa = await createIpa({
        projectId: refProject.id,
        periodNumber: i,
        periodFrom: new Date().toISOString(),
        periodTo: new Date().toISOString(),
        grossAmount: 10000,
        retentionRate: 0.1,
        retentionAmount: 1000,
        previousCertified: 0,
        currentClaim: 9000,
        netClaimed: 9000,
        currency: 'SAR',
      }, 'test-user');
      await transitionIpa(ipa.id, 'submit', 'test-user'); // auto-starts IPA workflow
      await driveWorkflow('ipa', ipa.id); // → approved_internal converges
      const issued = await transitionIpa(ipa.id, 'issue', 'test-user');
      refNumbers.push(issued.referenceNumber!);
    }

    // Verify sequential pattern: PROJ-REF-{ts}-IPA-001, -002, -003
    expect(refNumbers[0]).toBe(`PROJ-REF-${ts}-IPA-001`);
    expect(refNumbers[1]).toBe(`PROJ-REF-${ts}-IPA-002`);
    expect(refNumbers[2]).toBe(`PROJ-REF-${ts}-IPA-003`);

    // Verify uniqueness
    const unique = new Set(refNumbers);
    expect(unique.size).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Test 9: Audit log entries for all transitions
  // ---------------------------------------------------------------------------

  it('Test 9: Audit log entries recorded for all transitions', async () => {
    const ipa = await createIpa(makeIpaInput(), 'test-user');
    await transitionIpa(ipa.id, 'submit', 'test-user'); // auto-starts IPA workflow
    await driveWorkflow('ipa', ipa.id); // → approved_internal converges

    const auditEntries = await prisma.auditLog.findMany({
      where: { resourceType: 'ipa', resourceId: ipa.id },
      orderBy: { createdAt: 'asc' },
    });

    // α-rewrite: under the workflow-driven path the per-step approvals are
    // audited under resourceType 'workflow_instance' (not 'ipa'). The 'ipa'
    // resource records: create + submit + the convergence status write
    // (ipa.transition.workflow_approved). There is NO ipa.transition.approve /
    // .review on the workflow path.
    expect(auditEntries.length).toBeGreaterThanOrEqual(3);

    const actions = auditEntries.map((e) => e.action);
    expect(actions).toContain('ipa.create');
    expect(actions).toContain('ipa.transition.submit');
    expect(actions).toContain('ipa.transition.workflow_approved');

    // Final IPA status is approved_internal (convergence wrote it).
    const finalIpa = await prisma.ipa.findUniqueOrThrow({ where: { id: ipa.id } });
    expect(finalIpa.status).toBe('approved_internal');
  });

  // ---------------------------------------------------------------------------
  // Test 10: Variation assessment fields populated on review/approve
  // ---------------------------------------------------------------------------

  // SKIP pending PIC-79: variation assessment-data orphaned by 8656e57. See PIC-79.
  it.skip('Test 10: Variation assessment fields populated on review and approve [PIC-79-ORPHAN]', async () => {
    const vo = await createVariation({
      projectId: testProject.id,
      subtype: 'vo',
      title: 'Assessment Fields Test',
      description: 'Test assessment data',
      reason: 'Addendum A verification',
      costImpact: 70000,
      currency: 'SAR',
    }, 'test-user');

    await transitionVariation(vo.id, 'submit', 'test-user');

    // Review with assessment data
    await transitionVariation(vo.id, 'review', 'test-user', undefined, {
      assessedCostImpact: 5000,
      assessedTimeImpactDays: 10,
    });

    // Approve with approved data
    await transitionVariation(vo.id, 'approve', 'test-user', undefined, {
      approvedCostImpact: 4000,
      approvedTimeImpactDays: 8,
    });

    // Fetch from DB and verify all 4 fields
    const record = await prisma.variation.findUniqueOrThrow({ where: { id: vo.id } });
    expect(Number(record.assessedCostImpact)).toBe(5000);
    expect(record.assessedTimeImpactDays).toBe(10);
    expect(Number(record.approvedCostImpact)).toBe(4000);
    expect(record.approvedTimeImpactDays).toBe(8);
  });

  // ---------------------------------------------------------------------------
  // Test 11: CostProposal assessment fields
  // ---------------------------------------------------------------------------

  it('Test 11: CostProposal assessment fields populated on review and approve', async () => {
    const cp = await createCostProposal({
      projectId: testProject.id,
      revisionNumber: 1,
      estimatedCost: 50000,
      estimatedTimeDays: 30,
      currency: 'SAR',
    }, 'test-user');

    await transitionCostProposal(cp.id, 'submit', 'test-user');

    // Review with assessment data
    await transitionCostProposal(cp.id, 'review', 'test-user', undefined, {
      assessedCost: 30000,
      assessedTimeDays: 15,
    });

    // Approve with approved data
    await transitionCostProposal(cp.id, 'approve', 'test-user', undefined, {
      approvedCost: 25000,
      approvedTimeDays: 12,
    });

    // Fetch from DB and verify all 4 fields
    const record = await prisma.costProposal.findUniqueOrThrow({ where: { id: cp.id } });
    expect(Number(record.assessedCost)).toBe(30000);
    expect(record.assessedTimeDays).toBe(15);
    expect(Number(record.approvedCost)).toBe(25000);
    expect(record.approvedTimeDays).toBe(12);
  });

  // ---------------------------------------------------------------------------
  // Test 12: Dashboard variance analytics
  // ---------------------------------------------------------------------------

  it('Test 12: Dashboard variance analytics compute correctly', async () => {
    // Create a dedicated project for clean dashboard numbers
    const entity = await prisma.entity.create({
      data: { orgId: SINGLETON_ORG_ID, code: `ENT-DASH-INT-${ts}`, name: 'Dashboard Integration Entity', type: 'parent', status: 'active' },
    });
    const dashProject = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `PROJ-DASH-INT-${ts}`,
        name: 'Dashboard Integration',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });
    refProjectIds.push(dashProject.id); // workflow FK cleanup in afterAll

    // IPA: netClaimed = 100000 (approved -> counted in totalClaimed)
    const ipa = await createIpa({
      projectId: dashProject.id,
      periodNumber: 1,
      periodFrom: new Date().toISOString(),
      periodTo: new Date().toISOString(),
      grossAmount: 120000,
      retentionRate: 0.1,
      retentionAmount: 12000,
      previousCertified: 0,
      currentClaim: 100000,
      netClaimed: 100000,
      currency: 'SAR',
    }, 'test-user');
    await ensureRoleUsers(dashProject.id, 'dash'); // workflow approver resolution
    await transitionIpa(ipa.id, 'submit', 'test-user'); // auto-starts IPA workflow
    await driveWorkflow('ipa', ipa.id); // → approved_internal converges

    // IPC: netCertified = 80000 (signed -> counted in totalCertified)
    const ipc = await createIpc({
      projectId: dashProject.id,
      ipaId: ipa.id,
      certifiedAmount: 90000,
      retentionAmount: 10000,
      netCertified: 80000,
      certificationDate: new Date().toISOString(),
      currency: 'SAR',
    }, 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user'); // auto-starts IPC workflow
    await driveWorkflow('ipc', ipc.id); // → approved_internal converges
    await transitionIpc(ipc.id, 'sign', 'test-user');

    // Variation: costImpact = 50000. NOTE: under the α-rewrite the workflow
    // engine carries no domain payload, so approvedCostImpact stays NULL
    // (PIC-79 orphan). The dashboard's variationVariance.totalApproved reads
    // approvedCostImpact, so it computes 0 (full reduction) on this path — the
    // assertions below reflect that reality, not the pre-8656e57 40000.
    const vo = await createVariation({
      projectId: dashProject.id,
      subtype: 'vo',
      title: 'Dashboard VO',
      description: 'Dashboard variance test',
      reason: 'Scope',
      costImpact: 50000,
      currency: 'SAR',
    }, 'test-user');
    await transitionVariation(vo.id, 'submit', 'test-user'); // auto-starts workflow
    await driveWorkflow('variation', vo.id); // → approved_internal converges

    // CostProposal: estimatedCost = 30000, approvedCost = 25000
    const cp = await createCostProposal({
      projectId: dashProject.id,
      revisionNumber: 1,
      estimatedCost: 30000,
      estimatedTimeDays: 20,
      currency: 'SAR',
    }, 'test-user');
    await transitionCostProposal(cp.id, 'submit', 'test-user');
    await transitionCostProposal(cp.id, 'review', 'test-user', undefined, {
      assessedCost: 28000,
      assessedTimeDays: 18,
    });
    await transitionCostProposal(cp.id, 'approve', 'test-user', undefined, {
      approvedCost: 25000,
      approvedTimeDays: 15,
    });

    // Query dashboard
    const dashboard = await getCommercialDashboard(dashProject.id);

    // Financial summary
    expect(parseFloat(dashboard.financialSummary.totalClaimed)).toBe(100000);
    expect(parseFloat(dashboard.financialSummary.totalCertified)).toBe(80000);
    expect(parseFloat(dashboard.financialSummary.totalVariationExposure)).toBe(50000);

    // IPA variance: submitted=100000, certified=80000, reduction=20000, 20%
    expect(parseFloat(dashboard.varianceAnalytics.ipaVariance.totalSubmitted)).toBe(100000);
    expect(parseFloat(dashboard.varianceAnalytics.ipaVariance.totalCertified)).toBe(80000);
    expect(parseFloat(dashboard.varianceAnalytics.ipaVariance.reductionAmount)).toBe(20000);
    expect(dashboard.varianceAnalytics.ipaVariance.reductionPercent).toBe(20);

    // Variation variance — submitted side only. totalSubmitted = costImpact,
    // set at create, so it stays valid under the α-rewrite.
    // The approved side (totalApproved/reductionAmount/reductionPercent) reads
    // Variation.approvedCostImpact, orphaned by 8656e57 → split into Test 12b
    // (it.skip → PIC-79). Do NOT assert degraded values here.
    expect(parseFloat(dashboard.varianceAnalytics.variationVariance.totalSubmitted)).toBe(50000);

    // CostProposal variance: estimated=30000, approved=25000, reduction=5000, ~16.67%
    expect(parseFloat(dashboard.varianceAnalytics.costProposalVariance.totalEstimated)).toBe(30000);
    expect(parseFloat(dashboard.varianceAnalytics.costProposalVariance.totalApproved)).toBe(25000);
    expect(parseFloat(dashboard.varianceAnalytics.costProposalVariance.reductionAmount)).toBe(5000);
    expect(dashboard.varianceAnalytics.costProposalVariance.reductionPercent).toBeCloseTo(16.67, 1);
  });

  // PIC-79-ORPHAN: dashboard variationVariance approved-side (totalApproved /
  // reductionAmount / reductionPercent) derives from Variation.approvedCostImpact,
  // orphaned by 8656e57 (assessment-data-via-transition removed; review/approve are
  // now workflow-managed and the engine carries no domain payload). Pre-guard, a VO
  // with approvedCostImpact=40000 over submitted 50000 yielded totalApproved=40000,
  // reductionAmount=10000, reductionPercent=20. Split from Test 12 (which keeps the
  // valid ipa/CostProposal/totalSubmitted variance coverage as passing α-rewrite) so
  // the orphaned approved-side assertion stays visibly deferred, not silently dropped.
  // Restored by PIC-79. Do NOT rewrite to assert degraded values.
  it.skip('Test 12b: dashboard variationVariance approved-side reflects approvedCostImpact [PIC-79-ORPHAN]', async () => {
    const entity = await prisma.entity.create({
      data: { orgId: SINGLETON_ORG_ID, code: `ENT-VV-${ts}`, name: 'VV Test Entity', type: 'parent', status: 'active' },
    });
    const proj = await prisma.project.create({
      data: {
        orgId: SINGLETON_ORG_ID,
        code: `PROJ-VV-${ts}`, name: 'VV Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    const vo = await createVariation({
      projectId: proj.id, subtype: 'vo', title: 'VV', description: 'x', reason: 'x',
      costImpact: 50000, currency: 'SAR',
    }, 'test-user');
    await transitionVariation(vo.id, 'submit', 'test-user');
    // Pre-8656e57: drive to approved WITH approvedCostImpact=40000 — now orphaned (no path).
    const dashboard = await getCommercialDashboard(proj.id);
    expect(parseFloat(dashboard.varianceAnalytics.variationVariance.totalApproved)).toBe(40000);
    expect(parseFloat(dashboard.varianceAnalytics.variationVariance.reductionAmount)).toBe(10000);
    expect(dashboard.varianceAnalytics.variationVariance.reductionPercent).toBe(20);
  });
});
