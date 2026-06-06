/**
 * PIC-104 Phase A — RED reproduction: project-detail revised CV drifts from live.
 *
 * Proves the bug is REAL + STRUCTURAL on main 2bf1975 (unlike PIC-103, overturned).
 *
 * The project-detail Financial Baseline card renders the STORED
 * `project.revisedContractValue` column (apps/web/app/(app)/projects/[id]/page.tsx:96
 * → financial-baseline-card.tsx:58), labeled "Revised Contract Value (derived) …
 * Automatically derived from approved variation deltas. Not manually editable."
 *
 * But:
 *   - the ONLY writer of project.revisedContractValue is updateProject
 *     (projects/service.ts:233 — manual, explicit-pass-only);
 *   - variation approval NEVER syncs it (the variation service doesn't touch it).
 *
 * Meanwhile dashboard (financial-kpis.ts:282-283) + monthly-cost-sheet
 * (service.ts:285,378) compute the SAME quantity LIVE:
 *   revisedCV = contractValue + Σ approvedCostImpact
 *               WHERE (VO ∈ {client_approved, closed}) OR
 *                     (CO ∈ {approved_internal, signed, issued, closed})
 *
 * So once a VO is client-approved, the stored column (what project-detail shows)
 * disagrees with the live figure (what dashboard/cost-sheet show). This test
 * computes the live value the way the app does and asserts the stored column
 * equals it — which FAILS on unfixed main, reporting the drift.
 *
 * Phase B reframes: assert the project-detail surface (switched to live) == live.
 *
 * DB-backed (test Postgres). Per-test fixtures; cleaned in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, Prisma } from '@fmksa/db';
import { getRevisedContractValue, getApprovedVariationDelta } from '../../src/commercial/revised-contract-value';

const ts = `pic104-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const actor = 'pic104-test';

const CONTRACT_VALUE = 10_000_000;
const STORED_STALE = 8_000_000;       // a stale manual revisedContractValue
const APPROVED_VO_DELTA = 2_000_000;  // a VO client-approved AFTER the stored col was last set
// live revised CV = 10M + 2M = 12M ≠ stored 8M

let entityId: string;
let projA: string;  // stored = 8M stale
let projB: string;  // stored = null ("Not set")

/** Mirror the live VO/CO gate (financial-kpis.ts:204-216 / cost-sheet service.ts:285). */
async function liveRevisedCV(projectId: string, contractValue: number): Promise<Prisma.Decimal> {
  const agg = await prisma.variation.aggregate({
    where: {
      projectId,
      approvedCostImpact: { not: null },
      OR: [
        { subtype: 'vo', status: { in: ['client_approved', 'closed'] } },
        { subtype: 'change_order', status: { in: ['approved_internal', 'signed', 'issued', 'closed'] } },
      ],
    },
    _sum: { approvedCostImpact: true },
  });
  const delta = agg._sum.approvedCostImpact ?? new Prisma.Decimal(0);
  return new Prisma.Decimal(contractValue).plus(delta);
}

beforeAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  await prisma.currency.upsert({
    where: { code: 'SAR' }, update: {},
    create: { code: 'SAR', name: 'Saudi Riyal', symbol: 'SR', decimalPlaces: 2 },
  });
  const entity = await prisma.entity.create({
    data: { code: `ENT-${ts}`, name: 'PIC-104 Entity', type: 'parent', status: 'active' },
  });
  entityId = entity.id;

  // Project A — stored revisedContractValue = 8M (stale), contractValue 10M
  const pa = await prisma.project.create({
    data: {
      entityId, code: `PROJ-A-${ts}`, name: 'PIC-104 A', status: 'active',
      currencyCode: 'SAR', startDate: new Date('2026-01-01'), createdBy: actor,
      contractValue: CONTRACT_VALUE, revisedContractValue: STORED_STALE,
    },
  });
  projA = pa.id;

  // Project B — stored revisedContractValue = null ("Not set"), contractValue 10M
  const pb = await prisma.project.create({
    data: {
      entityId, code: `PROJ-B-${ts}`, name: 'PIC-104 B', status: 'active',
      currencyCode: 'SAR', startDate: new Date('2026-01-01'), createdBy: actor,
      contractValue: CONTRACT_VALUE, // revisedContractValue omitted → null
    },
  });
  projB = pb.id;

  // Both projects get a client-approved VO of +2M — never synced into the stored column.
  for (const projectId of [projA, projB]) {
    await prisma.variation.create({
      data: {
        projectId, subtype: 'vo', status: 'client_approved',
        title: `VO ${ts}`, description: 'approved after stored col last set', reason: 'client change',
        costImpact: APPROVED_VO_DELTA, approvedCostImpact: APPROVED_VO_DELTA,
        currency: 'SAR', createdBy: actor,
      },
    });
  }
  delete process.env.SEED_CONTEXT;
}, 60_000);

afterAll(async () => {
  process.env.SEED_CONTEXT = 'true';
  await prisma.variation.deleteMany({ where: { projectId: { in: [projA, projB] } } });
  await prisma.project.deleteMany({ where: { id: { in: [projA, projB] } } });
  await prisma.entity.deleteMany({ where: { id: entityId } });
  delete process.env.SEED_CONTEXT;
}, 60_000);

describe('PIC-104 — revised CV: project-detail now matches live (GREEN after fix)', () => {
  /**
   * RED on unfixed main (Phase A, documented): the project-detail card read the
   * STORED column → DRIFT-A stored 8,000,000 ≠ live 12,000,000; DRIFT-B stored
   * null ≠ live 12,000,000. The fix routes project-detail through
   * getRevisedContractValue (the same gate dashboard + cost-sheet use), so the
   * value it shows now equals live and no longer equals the stale stored column.
   */
  it('GREEN-A: getRevisedContractValue (what project-detail now shows) === live 12M, and ≠ the stale stored 8M', async () => {
    const helper = parseFloat((await getRevisedContractValue(projA))!.toString());
    const live = parseFloat((await liveRevisedCV(projA, CONTRACT_VALUE)).toString());
    const stored = parseFloat((await prisma.project.findUniqueOrThrow({ where: { id: projA } })).revisedContractValue!.toString());
    expect(helper).toBe(live);               // 12_000_000 — project-detail == dashboard/cost-sheet
    expect(helper).toBe(CONTRACT_VALUE + APPROVED_VO_DELTA); // 12_000_000
    expect(helper).not.toBe(stored);         // 12M ≠ stale 8M — no longer the drifted column
  });

  it('GREEN-B: "Not set" project — getRevisedContractValue derives 12M (was null/blank from the stored column)', async () => {
    const helper = parseFloat((await getRevisedContractValue(projB))!.toString());
    const storedRaw = (await prisma.project.findUniqueOrThrow({ where: { id: projB } })).revisedContractValue;
    expect(storedRaw).toBeNull();            // stored column never set → card used to render "Not set"
    expect(helper).toBe(CONTRACT_VALUE + APPROVED_VO_DELTA); // 12_000_000 — now shows the real derived value
  });

  it('FAITHFUL: helper gate === dashboard/cost-sheet inline gate (Σ approved VO/CO delta = 2M)', async () => {
    const delta = parseFloat((await getApprovedVariationDelta(projA)).toString());
    const live = parseFloat((await liveRevisedCV(projA, CONTRACT_VALUE)).toString());
    expect(delta).toBe(APPROVED_VO_DELTA);   // 2M — the shared gate matches the (replaced) inline copies
    expect(live).toBe(CONTRACT_VALUE + delta);
  });

  it('VESTIGIAL: stored project.revisedContractValue is no longer read by any surface (drop is a follow-up)', async () => {
    // The column still exists + still holds the stale 8M (updateProject can write it),
    // but no surface reads it now. Documents that the drift is closed by ignoring it,
    // not by syncing it. Column-drop tracked as a separate migration follow-up.
    const stored = (await prisma.project.findUniqueOrThrow({ where: { id: projA } })).revisedContractValue;
    expect(stored!.toString()).toBe(String(STORED_STALE)); // 8M still sits in the column, unread
  });
});
