/**
 * Derived Revised Contract Value — single source of truth.
 *
 * Before 2026-04-21 this derivation was inlined in getFinancialKpis for the
 * Commercial Dashboard, while the Project Overview's Financial Baseline card
 * read `project.revisedContractValue` (a stored column, stale since the
 * derivation refactor on `claude/romantic-hellman-ab1036`). The two surfaces
 * disagreed on the same number — e.g. 25,000,000 (Dashboard, derived) vs
 * 27,500,000 (Overview, stored) for FMKSA-2026-001.
 *
 * Formula:
 *   revised = contractValue
 *           + SUM(approvedCostImpact) where:
 *               VO : status ∈ {client_approved, closed}     ← client-ratified
 *               CO : status ∈ {approved_internal,           ← internal ok
 *                              signed, issued, closed}
 *               approvedCostImpact IS NOT NULL
 *
 * Rationale:
 *   - A VO changes the contract envelope only after the client ratifies.
 *   - A CO is internal to the delivery team and does not go to the client,
 *     so internal approval is sufficient.
 *
 * Returns null when the project has no contractValue (unseeded baseline).
 * Returns the derived value as a stringified number (decimals preserved).
 */
import { prisma } from '@fmksa/db';
import { Prisma } from '@fmksa/db';

export async function getDerivedRevisedContractValue(
  projectId: string,
): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { contractValue: true },
  });
  if (!project || project.contractValue == null) return null;

  const delta = await prisma.variation.aggregate({
    where: {
      projectId,
      approvedCostImpact: { not: null },
      OR: [
        { subtype: 'vo', status: { in: ['client_approved', 'closed'] } },
        {
          subtype: 'change_order',
          status: {
            in: ['approved_internal', 'signed', 'issued', 'closed'],
          },
        },
      ],
    },
    _sum: { approvedCostImpact: true },
  });

  const base = new Prisma.Decimal(project.contractValue.toString());
  const approvedDelta = new Prisma.Decimal(
    (delta._sum.approvedCostImpact ?? 0).toString(),
  );
  return base.plus(approvedDelta).toString();
}
