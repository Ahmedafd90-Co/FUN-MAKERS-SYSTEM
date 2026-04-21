/**
 * Reference-data snapshot builder.
 *
 * Stored on ImportBatch at validation time. The commit path re-reads the
 * same reference data and refuses to commit if the snapshot has drifted —
 * protecting against the case where a new budget category was added (or
 * an old one renamed) between validate and commit.
 *
 * Snapshot content is intentionally the MINIMUM needed to make the
 * validation decisions reproducible, not a full dump. For budget imports
 * we capture the set of category (code,name) pairs. For IPA imports we
 * capture the set of existing IPA periods for the project so the overlap
 * check is deterministic.
 */

import { prisma } from '@fmksa/db';
import type { ImportType } from '@fmksa/db';

export interface BudgetReferenceSnapshot {
  kind: 'budget_baseline';
  categories: Array<{ code: string; name: string }>;
}

export interface IpaReferenceSnapshot {
  kind: 'ipa_history';
  existingIpas: Array<{
    id: string;
    periodNumber: number;
    periodFrom: string;
    periodTo: string;
    origin: 'live' | 'imported_historical';
  }>;
}

export interface IpaForecastReferenceSnapshot {
  kind: 'ipa_forecast';
  existingForecasts: Array<{
    id: string;
    periodNumber: number;
    periodStart: string;
  }>;
}

export type ReferenceSnapshot =
  | BudgetReferenceSnapshot
  | IpaReferenceSnapshot
  | IpaForecastReferenceSnapshot;

export async function buildReferenceSnapshot(
  importType: ImportType,
  projectId: string,
): Promise<ReferenceSnapshot> {
  if (importType === 'budget_baseline') {
    const cats = await prisma.budgetCategory.findMany({
      select: { code: true, name: true },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      kind: 'budget_baseline',
      categories: cats.map((c) => ({ code: c.code, name: c.name })),
    };
  }

  if (importType === 'ipa_forecast') {
    const existingForecasts = await (prisma as any).ipaForecast.findMany({
      where: { projectId },
      select: { id: true, periodNumber: true, periodStart: true },
    });
    return {
      kind: 'ipa_forecast',
      existingForecasts: existingForecasts.map(
        (f: { id: string; periodNumber: number; periodStart: Date }) => ({
          id: f.id,
          periodNumber: f.periodNumber,
          periodStart: f.periodStart.toISOString(),
        }),
      ),
    };
  }

  const existing = await prisma.ipa.findMany({
    where: { projectId },
    select: {
      id: true,
      periodNumber: true,
      periodFrom: true,
      periodTo: true,
      origin: true,
    },
  });
  return {
    kind: 'ipa_history',
    existingIpas: existing.map((e) => ({
      id: e.id,
      periodNumber: e.periodNumber,
      periodFrom: e.periodFrom.toISOString(),
      periodTo: e.periodTo.toISOString(),
      origin: e.origin,
    })),
  };
}

/**
 * Compare two snapshots. Returns null if equivalent; otherwise returns a
 * one-line summary of what drifted — surfaced to the operator on commit
 * refusal so they know why they must re-validate.
 */
export function describeSnapshotDrift(
  a: ReferenceSnapshot,
  b: ReferenceSnapshot,
): string | null {
  if (a.kind !== b.kind) {
    return `Snapshot kind changed: ${a.kind} → ${b.kind}`;
  }
  if (a.kind === 'budget_baseline' && b.kind === 'budget_baseline') {
    const ja = JSON.stringify(a.categories);
    const jb = JSON.stringify(b.categories);
    if (ja !== jb) {
      return 'Budget category list changed since validation. Re-validate this batch.';
    }
    return null;
  }
  if (a.kind === 'ipa_history' && b.kind === 'ipa_history') {
    const ja = JSON.stringify(a.existingIpas);
    const jb = JSON.stringify(b.existingIpas);
    if (ja !== jb) {
      return 'Project IPA set changed since validation (new/removed/edited IPA). Re-validate this batch.';
    }
    return null;
  }
  if (a.kind === 'ipa_forecast' && b.kind === 'ipa_forecast') {
    const ja = JSON.stringify(a.existingForecasts);
    const jb = JSON.stringify(b.existingForecasts);
    if (ja !== jb) {
      return 'Project IPA forecast set changed since validation. Re-validate this batch.';
    }
    return null;
  }
  return null;
}
