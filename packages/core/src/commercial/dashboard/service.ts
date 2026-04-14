import { prisma } from '@fmksa/db';
import type { IpaStatus, IpcStatus, TaxInvoiceStatus, VariationStatus, CostProposalStatus } from '@fmksa/db';
// ---------------------------------------------------------------------------
// Status sets for financial aggregates
// ---------------------------------------------------------------------------

const IPA_APPROVED_PLUS = ['approved_internal', 'signed', 'issued', 'superseded', 'closed'];
const IPC_SIGNED_PLUS = ['signed', 'issued', 'superseded', 'closed'];
// Cancelled = void (no real invoiced value). Superseded = replaced (would double-count).
const TI_ISSUED_PLUS = ['issued', 'submitted', 'partially_collected', 'collected', 'overdue'];
const VAR_APPROVED_PLUS = ['approved_internal', 'signed', 'issued', 'client_pending', 'client_approved', 'client_rejected', 'superseded', 'closed'];
const CP_APPROVED_PLUS = ['approved_internal', 'issued', 'linked_to_variation', 'superseded', 'closed'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decimalToString(val: { toString(): string } | null | undefined): string {
  if (val == null) return '0';
  return val.toString();
}

function groupByToSummary(rows: { status: string; _count: { _all: number } }[]) {
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }
  return { total, byStatus };
}

function subtypeGroupByToRecord(rows: { subtype: string; _count: { _all: number } }[]) {
  const bySubtype: Record<string, number> = {};
  for (const row of rows) {
    bySubtype[row.subtype] = row._count._all;
  }
  return bySubtype;
}

function computeVariance(submitted: string, approved: string) {
  const sub = parseFloat(submitted) || 0;
  const app = parseFloat(approved) || 0;
  const reduction = sub - app;
  const percent = sub > 0 ? (reduction / sub) * 100 : 0;
  return {
    reductionAmount: reduction.toString(),
    reductionPercent: Math.round(percent * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Main dashboard query
// ---------------------------------------------------------------------------

export async function getCommercialDashboard(projectId: string) {
  const [
    // Project metadata
    project,
    // Register summary groupBy queries
    ipaByStatus,
    ipcByStatus,
    variationByStatus,
    variationBySubtype,
    costProposalByStatus,
    taxInvoiceByStatus,
    correspondenceByStatus,
    correspondenceBySubtype,
    // Financial aggregates
    ipaClaimed,
    ipcCertified,
    tiInvoiced,
    varExposure,
    varApproved,
    cpEstimated,
    cpApproved,
    // Recent activity
    recentActivity,
  ] = await Promise.all([
    // --- Project currency ---
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { currencyCode: true },
    }),
    // --- Register summary ---
    prisma.ipa.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { _all: true },
    }),
    prisma.ipc.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { _all: true },
    }),
    prisma.variation.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { _all: true },
    }),
    prisma.variation.groupBy({
      by: ['subtype'],
      where: { projectId },
      _count: { _all: true },
    }),
    prisma.costProposal.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { _all: true },
    }),
    prisma.taxInvoice.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { _all: true },
    }),
    prisma.correspondence.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { _all: true },
    }),
    prisma.correspondence.groupBy({
      by: ['subtype'],
      where: { projectId },
      _count: { _all: true },
    }),

    // --- Financial aggregates ---
    prisma.ipa.aggregate({
      where: { projectId, status: { in: IPA_APPROVED_PLUS as IpaStatus[] } },
      _sum: { netClaimed: true },
    }),
    prisma.ipc.aggregate({
      where: { projectId, status: { in: IPC_SIGNED_PLUS as IpcStatus[] } },
      _sum: { netCertified: true },
    }),
    prisma.taxInvoice.aggregate({
      where: { projectId, status: { in: TI_ISSUED_PLUS as TaxInvoiceStatus[] } },
      _sum: { totalAmount: true },
    }),
    prisma.variation.aggregate({
      where: { projectId, status: { in: VAR_APPROVED_PLUS as VariationStatus[] } },
      _sum: { costImpact: true },
    }),
    // Status-gated: only count approved amounts from records still in approved+ statuses.
    // A variation that was rejected after having approvedCostImpact set must not count.
    prisma.variation.aggregate({
      where: { projectId, status: { in: VAR_APPROVED_PLUS as VariationStatus[] }, approvedCostImpact: { not: null } },
      _sum: { approvedCostImpact: true },
    }),
    prisma.costProposal.aggregate({
      where: { projectId, status: { in: CP_APPROVED_PLUS as CostProposalStatus[] } },
      _sum: { estimatedCost: true },
    }),
    // Status-gated: same rationale as variation above.
    prisma.costProposal.aggregate({
      where: { projectId, status: { in: CP_APPROVED_PLUS as CostProposalStatus[] }, approvedCost: { not: null } },
      _sum: { approvedCost: true },
    }),

    // --- Recent activity ---
    prisma.auditLog.findMany({
      where: {
        projectId,
        resourceType: { in: ['ipa', 'ipc', 'variation', 'cost_proposal', 'tax_invoice', 'correspondence'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, action: true, resourceType: true, resourceId: true, createdAt: true },
    }),
  ]);

  // --- Build register summary ---
  const ipaSummary = groupByToSummary(ipaByStatus);
  const ipcSummary = groupByToSummary(ipcByStatus);
  const variationSummary = {
    ...groupByToSummary(variationByStatus),
    bySubtype: subtypeGroupByToRecord(variationBySubtype),
  };
  const costProposalSummary = groupByToSummary(costProposalByStatus);
  const taxInvoiceSummary = groupByToSummary(taxInvoiceByStatus);
  const correspondenceSummary = {
    ...groupByToSummary(correspondenceByStatus),
    bySubtype: subtypeGroupByToRecord(correspondenceBySubtype),
  };

  // --- Build financial summary ---
  const totalClaimed = decimalToString(ipaClaimed._sum?.netClaimed ?? null);
  const totalCertified = decimalToString(ipcCertified._sum?.netCertified ?? null);
  const totalInvoiced = decimalToString(tiInvoiced._sum?.totalAmount ?? null);
  const totalVariationExposure = decimalToString(varExposure._sum?.costImpact ?? null);

  // --- Build variance analytics ---
  const totalVarApproved = decimalToString(varApproved._sum?.approvedCostImpact ?? null);
  const totalCpEstimated = decimalToString(cpEstimated._sum?.estimatedCost ?? null);
  const totalCpApproved = decimalToString(cpApproved._sum?.approvedCost ?? null);

  const ipaVar = computeVariance(totalClaimed, totalCertified);
  const variationVar = computeVariance(totalVariationExposure, totalVarApproved);
  const cpVar = computeVariance(totalCpEstimated, totalCpApproved);

  return {
    projectCurrency: project.currencyCode,
    registerSummary: {
      ipa: ipaSummary,
      ipc: ipcSummary,
      variation: variationSummary,
      costProposal: costProposalSummary,
      taxInvoice: taxInvoiceSummary,
      correspondence: correspondenceSummary,
    },
    financialSummary: {
      totalClaimed,
      totalCertified,
      totalInvoiced,
      totalVariationExposure,
    },
    recentActivity,
    varianceAnalytics: {
      ipaVariance: {
        totalSubmitted: totalClaimed,
        totalCertified,
        ...ipaVar,
      },
      variationVariance: {
        totalSubmitted: totalVariationExposure,
        totalApproved: totalVarApproved,
        ...variationVar,
      },
      costProposalVariance: {
        totalEstimated: totalCpEstimated,
        totalApproved: totalCpApproved,
        ...cpVar,
      },
    },
  };
}
