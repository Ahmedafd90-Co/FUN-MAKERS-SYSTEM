/**
 * RFQ SLA tracking — PIC-53 (Layer 2.5 PR-4).
 *
 * Two SLAs computed at read time (no denormalisation):
 *
 *   1. Time-to-respond (per RFQVendor): days between RFQVendor.sentAt
 *      and RFQVendor.respondedAt. Breached when > projectSetting
 *      `rfq_sla_response_days:{projectId}`.
 *
 *   2. Time-to-award (per RFQ): days between the audit-logged
 *      `rfq.transition.issue` timestamp and the `rfq.transition.award`
 *      timestamp. Breached when > projectSetting
 *      `rfq_sla_award_days:{projectId}`.
 *
 * Read-time computation. Nothing persisted. No denormalisation.
 *
 * Threshold values are PD-decided per-project per the PIC-41 governance
 * discipline — NEVER hardcoded in code, seed, fixture, or test-as-policy.
 * When a threshold is unset, `slaBreached: null` is returned (caller
 * decides the UX — usually "no SLA configured" badge).
 *
 * No alerting / notification infrastructure in this PR. That's a
 * separate ticket if Pico Play later decides breaches should
 * proactively notify.
 */

import { prisma } from '@fmksa/db';
import { assertProjectScope } from '../../scope-binding';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VendorSlaSnapshot = {
  rfqVendorId: string;
  vendorId: string;
  sentAt: Date | null;
  respondedAt: Date | null;
  daysToRespond: number | null;
  slaResponseDays: number | null; // configured threshold; null if unset
  slaBreached: boolean | null; // null when threshold unset; boolean otherwise
};

export type RfqSlaSnapshot = {
  rfqId: string;
  status: string;
  issuedAt: Date | null;
  awardedAt: Date | null;
  daysToAward: number | null;
  slaAwardDays: number | null; // configured threshold; null if unset
  slaBreached: boolean | null; // null when threshold unset; boolean otherwise
  vendors: VendorSlaSnapshot[];
};

// ---------------------------------------------------------------------------
// Threshold resolution
// ---------------------------------------------------------------------------

async function resolveDayThreshold(
  projectId: string,
  key: string,
): Promise<number | null> {
  const setting = await prisma.projectSetting.findUnique({
    where: { projectId_key: { projectId, key } },
  });
  if (!setting || typeof setting.valueJson !== 'string' || setting.valueJson.length === 0) {
    return null;
  }
  const parsed = Number.parseInt(setting.valueJson, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    // Malformed value — safe-default to "unset" (caller sees breached: null)
    // rather than throwing during a read-time SLA query. Same safety direction
    // as PIC-41's malformed-threshold handling: an operator data error must
    // not break the read path; the operator should fix the projectSetting.
    return null;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Day delta helper
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const deltaMs = end.getTime() - start.getTime();
  if (deltaMs < 0) return 0; // safety; respondedAt before sentAt shouldn't happen
  return Math.floor(deltaMs / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the SLA snapshot for an RFQ.
 *
 * Reads:
 *   - The RFQ + its rfqVendors
 *   - The audit log entries for `rfq.transition.issue` and
 *     `rfq.transition.award` actions (timestamps for the time-to-award SLA)
 *   - projectSetting thresholds (`rfq_sla_response_days`,
 *     `rfq_sla_award_days`)
 *
 * Computes per-vendor `daysToRespond` + per-RFQ `daysToAward` deltas.
 * Returns the snapshot; nothing is persisted.
 */
export async function computeRfqSlaSnapshot(
  rfqId: string,
  projectId: string,
): Promise<RfqSlaSnapshot> {
  const rfq = await prisma.rFQ.findUniqueOrThrow({
    where: { id: rfqId },
    include: { rfqVendors: true },
  });
  assertProjectScope(rfq, projectId, 'RFQ', rfqId);

  const slaResponseDays = await resolveDayThreshold(projectId, 'rfq_sla_response_days');
  const slaAwardDays = await resolveDayThreshold(projectId, 'rfq_sla_award_days');

  // Audit-log lookup for issued / awarded timestamps.
  // The transition service logs `rfq.transition.issue` and
  // `rfq.transition.award` actions on the RFQ resource. The earliest
  // record per action is the canonical timestamp (transition is one-shot
  // per RFQ — issued and awarded each happen at most once on a given RFQ).
  const transitionAudits = await prisma.auditLog.findMany({
    where: {
      resourceType: 'rfq',
      resourceId: rfqId,
      action: { in: ['rfq.transition.issue', 'rfq.transition.award'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { action: true, createdAt: true },
  });

  let issuedAt: Date | null = null;
  let awardedAt: Date | null = null;
  for (const a of transitionAudits) {
    if (a.action === 'rfq.transition.issue' && issuedAt === null) issuedAt = a.createdAt;
    if (a.action === 'rfq.transition.award' && awardedAt === null) awardedAt = a.createdAt;
  }

  const daysToAward = daysBetween(issuedAt, awardedAt);
  const awardBreached =
    slaAwardDays === null || daysToAward === null ? null : daysToAward > slaAwardDays;

  // Per-vendor SLA snapshots
  const vendors: VendorSlaSnapshot[] = rfq.rfqVendors.map((v) => {
    const daysToRespond = daysBetween(v.sentAt, v.respondedAt);
    const responseBreached =
      slaResponseDays === null || daysToRespond === null
        ? null
        : daysToRespond > slaResponseDays;
    return {
      rfqVendorId: v.id,
      vendorId: v.vendorId,
      sentAt: v.sentAt,
      respondedAt: v.respondedAt,
      daysToRespond,
      slaResponseDays,
      slaBreached: responseBreached,
    };
  });

  return {
    rfqId,
    status: rfq.status,
    issuedAt,
    awardedAt,
    daysToAward,
    slaAwardDays,
    slaBreached: awardBreached,
    vendors,
  };
}
