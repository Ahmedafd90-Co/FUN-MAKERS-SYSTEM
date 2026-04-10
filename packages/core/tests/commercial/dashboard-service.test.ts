import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@fmksa/db';
import { getCommercialDashboard } from '../../src/commercial/dashboard/service';
import { createIpa, transitionIpa } from '../../src/commercial/ipa/service';
import { createIpc, transitionIpc } from '../../src/commercial/ipc/service';
import { createVariation, transitionVariation } from '../../src/commercial/variation/service';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';

describe('Dashboard Service', () => {
  let testProject: { id: string };
  const ts = Date.now();

  beforeAll(async () => {
    registerCommercialEventTypes();

    const entity = await prisma.entity.create({
      data: { code: `ENT-DASH-${ts}`, name: 'Dashboard Test Entity', type: 'parent', status: 'active' },
    });
    await prisma.currency.upsert({
      where: { code: 'SAR' }, update: {},
      create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
    });
    const project = await prisma.project.create({
      data: {
        code: `PROJ-DASH-${ts}`, name: 'Dashboard Test', entityId: entity.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    testProject = { id: project.id };

    // Create test data: 2 IPAs (1 approved, 1 draft), 1 IPC signed
    const ipa1 = await createIpa({
      projectId: testProject.id, periodNumber: 1,
      periodFrom: new Date().toISOString(), periodTo: new Date().toISOString(),
      grossAmount: 100000, retentionRate: 0.1, retentionAmount: 10000,
      previousCertified: 0, currentClaim: 90000, netClaimed: 90000, currency: 'SAR',
    }, 'test-user');
    await transitionIpa(ipa1.id, 'submit', 'test-user');
    await transitionIpa(ipa1.id, 'review', 'test-user');
    await transitionIpa(ipa1.id, 'approve', 'test-user');

    const ipa2 = await createIpa({
      projectId: testProject.id, periodNumber: 2,
      periodFrom: new Date().toISOString(), periodTo: new Date().toISOString(),
      grossAmount: 50000, retentionRate: 0.1, retentionAmount: 5000,
      previousCertified: 0, currentClaim: 45000, netClaimed: 45000, currency: 'SAR',
    }, 'test-user');
    // ipa2 stays in draft

    // IPC on approved IPA
    const ipc = await createIpc({
      projectId: testProject.id, ipaId: ipa1.id,
      certifiedAmount: 80000, retentionAmount: 8000, netCertified: 72000,
      certificationDate: new Date().toISOString(), currency: 'SAR',
    }, 'test-user');
    await transitionIpc(ipc.id, 'submit', 'test-user');
    await transitionIpc(ipc.id, 'review', 'test-user');
    await transitionIpc(ipc.id, 'approve', 'test-user');
    await transitionIpc(ipc.id, 'sign', 'test-user');

    // 1 Variation (VO) approved
    const vo = await createVariation({
      projectId: testProject.id, subtype: 'vo', title: 'Test VO',
      description: 'Test', reason: 'Change', costImpact: 50000, currency: 'SAR',
    }, 'test-user');
    await transitionVariation(vo.id, 'submit', 'test-user');
    await transitionVariation(vo.id, 'review', 'test-user');
    await transitionVariation(vo.id, 'approve', 'test-user', undefined, {
      approvedCostImpact: 40000, approvedTimeImpactDays: 10,
    });
  });

  it('returns correct registerSummary', async () => {
    const result = await getCommercialDashboard(testProject.id);

    // 2 IPAs total
    expect(result.registerSummary.ipa.total).toBe(2);
    expect(result.registerSummary.ipa.byStatus.draft).toBe(1);
    expect(result.registerSummary.ipa.byStatus.approved_internal).toBe(1);

    // 1 IPC
    expect(result.registerSummary.ipc.total).toBe(1);
    expect(result.registerSummary.ipc.byStatus.signed).toBe(1);

    // 1 Variation
    expect(result.registerSummary.variation.total).toBe(1);
    expect(result.registerSummary.variation.bySubtype.vo).toBe(1);
  });

  it('returns correct financialSummary', async () => {
    const result = await getCommercialDashboard(testProject.id);

    // totalClaimed: IPA1 netClaimed (90000) — IPA2 is draft, not counted
    expect(parseFloat(result.financialSummary.totalClaimed)).toBe(90000);

    // totalCertified: IPC netCertified (72000)
    expect(parseFloat(result.financialSummary.totalCertified)).toBe(72000);

    // totalVariationExposure: VO costImpact (50000)
    expect(parseFloat(result.financialSummary.totalVariationExposure)).toBe(50000);
  });

  it('returns variance analytics with correct reduction', async () => {
    const result = await getCommercialDashboard(testProject.id);

    // IPA variance: submitted 90000 vs certified 72000 = 18000 reduction (20%)
    expect(parseFloat(result.varianceAnalytics.ipaVariance.totalSubmitted)).toBe(90000);
    expect(parseFloat(result.varianceAnalytics.ipaVariance.totalCertified)).toBe(72000);
    expect(parseFloat(result.varianceAnalytics.ipaVariance.reductionAmount)).toBe(18000);
    expect(result.varianceAnalytics.ipaVariance.reductionPercent).toBe(20);

    // Variation variance: submitted 50000, approved 40000 = 10000 reduction (20%)
    expect(parseFloat(result.varianceAnalytics.variationVariance.totalSubmitted)).toBe(50000);
    expect(parseFloat(result.varianceAnalytics.variationVariance.totalApproved)).toBe(40000);
    expect(parseFloat(result.varianceAnalytics.variationVariance.reductionAmount)).toBe(10000);
    expect(result.varianceAnalytics.variationVariance.reductionPercent).toBe(20);
  });

  it('returns recentActivity as audit log entries', async () => {
    const result = await getCommercialDashboard(testProject.id);
    expect(result.recentActivity.length).toBeGreaterThan(0);
    expect(result.recentActivity.length).toBeLessThanOrEqual(10);
    // Most recent first
    if (result.recentActivity.length > 1) {
      const first = result.recentActivity[0];
      const second = result.recentActivity[1];
      if (first && second) {
        expect(first.createdAt.getTime()).toBeGreaterThanOrEqual(
          second.createdAt.getTime()
        );
      }
    }
  });

  it('returns empty dashboard for project with no data', async () => {
    const entity2 = await prisma.entity.create({
      data: { code: `ENT-DASH2-${ts}`, name: 'Empty Dash Entity', type: 'parent', status: 'active' },
    });
    const emptyProject = await prisma.project.create({
      data: {
        code: `PROJ-DASH2-${ts}`, name: 'Empty Dashboard', entityId: entity2.id,
        status: 'active', currencyCode: 'SAR', startDate: new Date(), createdBy: 'test',
      },
    });
    const result = await getCommercialDashboard(emptyProject.id);
    expect(result.registerSummary.ipa.total).toBe(0);
    expect(result.financialSummary.totalClaimed).toBe('0');
    expect(result.varianceAnalytics.ipaVariance.reductionPercent).toBe(0);
  });
});
