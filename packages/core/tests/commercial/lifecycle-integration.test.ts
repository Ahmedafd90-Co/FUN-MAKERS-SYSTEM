import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { createIpa, transitionIpa } from '../../src/commercial/ipa/service';
import { createIpc, transitionIpc } from '../../src/commercial/ipc/service';
import { createVariation, transitionVariation } from '../../src/commercial/variation/service';
import { createCostProposal, transitionCostProposal } from '../../src/commercial/cost-proposal/service';
import { createTaxInvoice, transitionTaxInvoice } from '../../src/commercial/tax-invoice/service';
import { createCorrespondence, transitionCorrespondence } from '../../src/commercial/correspondence/service';
import { getCommercialDashboard } from '../../src/commercial/dashboard/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';

describe('Commercial Lifecycle Integration', () => {
  let testProject: { id: string; code: string; entityId: string };
  const ts = Date.now();

  beforeAll(async () => {
    registerCommercialEventTypes();

    const entity = await prisma.entity.create({
      data: { code: `ENT-INT-${ts}`, name: 'Integration Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' },
      update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
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
    // IPA: create -> submit -> review -> approve (fires IPA_APPROVED)
    const ipa = await createIpa(makeIpaInput(), 'test-user');
    await transitionIpa(ipa.id, 'submit', 'test-user');
    await transitionIpa(ipa.id, 'review', 'test-user');
    await transitionIpa(ipa.id, 'approve', 'test-user');

    // IPC: create(ipaId) -> submit -> review -> approve -> sign (fires IPC_SIGNED)
    const ipc = await createIpc(makeIpcInput(ipa.id), 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user');
    await transitionIpc(ipc.id, 'review', 'test-user');
    await transitionIpc(ipc.id, 'approve', 'test-user');
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

  it('Test 2: VO lifecycle fires VARIATION_APPROVED_INTERNAL and VARIATION_APPROVED_CLIENT', async () => {
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

    // submit -> approve -> sign -> issue (fires CLAIM_ISSUED)
    await transitionCorrespondence(claim.id, 'submit', 'test-user');
    await transitionCorrespondence(claim.id, 'approve', 'test-user');
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

    // submit -> approve -> sign -> issue (fires BACK_CHARGE_ISSUED)
    await transitionCorrespondence(bc.id, 'submit', 'test-user');
    await transitionCorrespondence(bc.id, 'approve', 'test-user');
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
    await transitionIpa(ipa.id, 'submit', 'test-user');
    await transitionIpa(ipa.id, 'review', 'test-user');
    await transitionIpa(ipa.id, 'approve', 'test-user');

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

    // Full lifecycle to issued
    await transitionVariation(co.id, 'submit', 'test-user');
    await transitionVariation(co.id, 'review', 'test-user');
    await transitionVariation(co.id, 'approve', 'test-user');
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
      data: { code: `ENT-REF-${ts}`, name: 'Ref Test Entity', type: 'parent', status: 'active' },
    });
    const refProject = await prisma.project.create({
      data: {
        code: `PROJ-REF-${ts}`,
        name: 'Ref Test',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });

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
      await transitionIpa(ipa.id, 'submit', 'test-user');
      await transitionIpa(ipa.id, 'review', 'test-user');
      await transitionIpa(ipa.id, 'approve', 'test-user');
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
    await transitionIpa(ipa.id, 'submit', 'test-user');
    await transitionIpa(ipa.id, 'review', 'test-user');
    await transitionIpa(ipa.id, 'approve', 'test-user');

    const auditEntries = await prisma.auditLog.findMany({
      where: { resourceType: 'ipa', resourceId: ipa.id },
      orderBy: { createdAt: 'asc' },
    });

    // At minimum: create + submit + review + approve = 4 entries
    // (plus posting_event_posted audit entry in a separate resource)
    expect(auditEntries.length).toBeGreaterThanOrEqual(3);

    // Verify expected actions exist
    const actions = auditEntries.map((e) => e.action);
    expect(actions).toContain('ipa.create');
    expect(actions).toContain('ipa.transition.submit');
    expect(actions).toContain('ipa.transition.approve');
  });

  // ---------------------------------------------------------------------------
  // Test 10: Variation assessment fields populated on review/approve
  // ---------------------------------------------------------------------------

  it('Test 10: Variation assessment fields populated on review and approve', async () => {
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
      data: { code: `ENT-DASH-INT-${ts}`, name: 'Dashboard Integration Entity', type: 'parent', status: 'active' },
    });
    const dashProject = await prisma.project.create({
      data: {
        code: `PROJ-DASH-INT-${ts}`,
        name: 'Dashboard Integration',
        entityId: entity.id,
        status: 'active',
        currencyCode: 'SAR',
        startDate: new Date(),
        createdBy: 'test',
      },
    });

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
    await transitionIpa(ipa.id, 'submit', 'test-user');
    await transitionIpa(ipa.id, 'review', 'test-user');
    await transitionIpa(ipa.id, 'approve', 'test-user');

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
    await transitionIpc(ipc.id, 'submit', 'test-user');
    await transitionIpc(ipc.id, 'review', 'test-user');
    await transitionIpc(ipc.id, 'approve', 'test-user');
    await transitionIpc(ipc.id, 'sign', 'test-user');

    // Variation: costImpact = 50000, approvedCostImpact = 40000
    const vo = await createVariation({
      projectId: dashProject.id,
      subtype: 'vo',
      title: 'Dashboard VO',
      description: 'Dashboard variance test',
      reason: 'Scope',
      costImpact: 50000,
      currency: 'SAR',
    }, 'test-user');
    await transitionVariation(vo.id, 'submit', 'test-user');
    await transitionVariation(vo.id, 'review', 'test-user');
    await transitionVariation(vo.id, 'approve', 'test-user', undefined, {
      approvedCostImpact: 40000,
      approvedTimeImpactDays: 5,
    });

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

    // Variation variance: submitted=50000, approved=40000, reduction=10000, 20%
    expect(parseFloat(dashboard.varianceAnalytics.variationVariance.totalSubmitted)).toBe(50000);
    expect(parseFloat(dashboard.varianceAnalytics.variationVariance.totalApproved)).toBe(40000);
    expect(parseFloat(dashboard.varianceAnalytics.variationVariance.reductionAmount)).toBe(10000);
    expect(dashboard.varianceAnalytics.variationVariance.reductionPercent).toBe(20);

    // CostProposal variance: estimated=30000, approved=25000, reduction=5000, ~16.67%
    expect(parseFloat(dashboard.varianceAnalytics.costProposalVariance.totalEstimated)).toBe(30000);
    expect(parseFloat(dashboard.varianceAnalytics.costProposalVariance.totalApproved)).toBe(25000);
    expect(parseFloat(dashboard.varianceAnalytics.costProposalVariance.reductionAmount)).toBe(5000);
    expect(dashboard.varianceAnalytics.costProposalVariance.reductionPercent).toBeCloseTo(16.67, 1);
  });
});
