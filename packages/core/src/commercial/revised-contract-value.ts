/**
 * Revised Contract Value — single source of the approved-variation gate.
 *
 * PIC-104 (recovery #3 of the vigorous-mahavira audit): three surfaces compute
 * "revised contract value = contractValue + Σ approved variation deltas" and the
 * project-detail card had drifted by reading a stale stored column instead. The
 * drift-prone part is the APPROVAL GATE — which variation statuses count. This
 * module owns that gate once; all surfaces consume it.
 *
 * The gate (faithful to the prior identical inline copies in
 * dashboard/financial-kpis.ts and monthly-cost-sheet/service.ts):
 *   - VO (variation order): counts once the CLIENT has approved
 *       status ∈ { client_approved, closed }
 *   - CO (change order): internal approval is sufficient (a CO never goes to
 *     the client) → status ∈ { approved_internal, signed, issued, closed }
 *   - only variations with a non-null approvedCostImpact contribute.
 *
 * Revised CV = contractValue + Σ approvedCostImpact (over the gated set).
 */
import { prisma, Prisma } from '@fmksa/db';

/**
 * Σ approvedCostImpact for variations past the approval gate (0 when none).
 *
 * This is the shared GATE — the single definition of which variations count
 * toward the revised contract value. Consumed by:
 *   - dashboard/financial-kpis.ts (revised_budget KPI)
 *   - monthly-cost-sheet/service.ts (anticipatedContractAmount)
 *   - projects/[id] project-detail (Financial Baseline card)
 *
 * Project-scoped via the `projectId` where-filter (no by-id read on a tenant
 * model → scope-binding guard unaffected).
 */
export async function getApprovedVariationDelta(
  projectId: string,
): Promise<Prisma.Decimal> {
  const agg = await prisma.variation.aggregate({
    where: {
      projectId,
      approvedCostImpact: { not: null },
      OR: [
        { subtype: 'vo', status: { in: ['client_approved', 'closed'] } },
        {
          subtype: 'change_order',
          status: { in: ['approved_internal', 'signed', 'issued', 'closed'] },
        },
      ],
    },
    _sum: { approvedCostImpact: true },
  });
  return agg._sum.approvedCostImpact ?? new Prisma.Decimal(0);
}

/**
 * Revised Contract Value for a project = contractValue + Σ approved deltas.
 *
 * Returns `null` when the project has no contractValue — mirroring the existing
 * `budget !== null ? budget.plus(deltas) : null` semantics on every consuming
 * surface (so "no contract value" reads as "not set", never as "0 + deltas").
 *
 * Full DB form (fetches contractValue itself) for callers that don't already
 * hold the project — i.e. the project-detail page. Callers that already have
 * contractValue in hand (dashboard, cost-sheet) use `getApprovedVariationDelta`
 * directly and add it to the contractValue they already loaded.
 */
export async function getRevisedContractValue(
  projectId: string,
): Promise<Prisma.Decimal | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { contractValue: true },
  });
  if (!project || project.contractValue == null) return null;
  const delta = await getApprovedVariationDelta(projectId);
  return new Prisma.Decimal(project.contractValue.toString()).plus(delta);
}
