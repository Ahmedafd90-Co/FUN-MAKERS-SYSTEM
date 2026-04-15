'use client';

/**
 * Per-project reconciliation table — three-column KPI comparison.
 *
 * Shows source-record total vs posting-ledger total vs displayed KPI value,
 * with status badges, delta, and operator-readable basis text.
 */

import { Badge } from '@fmksa/ui/components/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@fmksa/ui/components/popover';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  HelpCircle,
  Info,
} from 'lucide-react';

import type { ReconciliationResult, ReconciliationStatus } from '@fmksa/core';

// ---------------------------------------------------------------------------
// Status display helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  ReconciliationStatus,
  { label: string; icon: typeof CheckCircle2; colorClass: string }
> = {
  matched: {
    label: 'Matched',
    icon: CheckCircle2,
    colorClass: 'text-green-600 dark:text-green-400',
  },
  mismatched: {
    label: 'Mismatched',
    icon: XCircle,
    colorClass: 'text-red-600 dark:text-red-400',
  },
  missing_postings: {
    label: 'Missing Postings',
    icon: AlertTriangle,
    colorClass: 'text-amber-600 dark:text-amber-400',
  },
  partially_reconcilable: {
    label: 'Partial',
    icon: MinusCircle,
    colorClass: 'text-blue-600 dark:text-blue-400',
  },
  not_reconcilable: {
    label: 'N/A',
    icon: HelpCircle,
    colorClass: 'text-muted-foreground',
  },
};

function StatusBadge({ status }: { status: ReconciliationStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.colorClass}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function formatCurrency(val: string | null): string {
  if (val === null) return '--';
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Summary strip
// ---------------------------------------------------------------------------

function ReconciliationSummary({ summary }: { summary: ReconciliationResult['summary'] }) {
  const items = [
    { label: 'Total KPIs', value: summary.totalKpis, colorClass: '' },
    { label: 'Matched', value: summary.matched, colorClass: 'text-green-600 dark:text-green-400' },
    { label: 'Mismatched', value: summary.mismatched, colorClass: 'text-red-600 dark:text-red-400' },
    { label: 'Missing Postings', value: summary.missingPostings, colorClass: 'text-amber-600 dark:text-amber-400' },
    { label: 'Partial', value: summary.partiallyReconcilable, colorClass: 'text-blue-600 dark:text-blue-400' },
    { label: 'Not Reconcilable', value: summary.notReconcilable, colorClass: 'text-muted-foreground' },
  ];

  return (
    <div className="flex flex-wrap gap-4 rounded-md border bg-muted/30 px-4 py-3">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <p className={`text-lg font-semibold tabular-nums ${item.colorClass}`}>{item.value}</p>
          <p className="text-xs text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main table
// ---------------------------------------------------------------------------

type ReconciliationTableProps = {
  result: ReconciliationResult;
};

export function ReconciliationTable({ result }: ReconciliationTableProps) {
  const kpiEntries = Object.values(result.kpis);

  // Sort: mismatched first, then missing_postings, partial, matched, n/a
  const ORDER: Record<ReconciliationStatus, number> = {
    mismatched: 0,
    missing_postings: 1,
    partially_reconcilable: 2,
    matched: 3,
    not_reconcilable: 4,
  };

  const sorted = [...kpiEntries].sort(
    (a, b) => (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5),
  );

  return (
    <div className="space-y-4">
      <ReconciliationSummary summary={result.summary} />

      <div className="text-xs text-muted-foreground">
        Computed at {new Date(result.computedAt).toLocaleString()}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">KPI</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Source Total</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ledger Total</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Displayed</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Delta</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                <span className="sr-only">Info</span>
                <Info className="h-3.5 w-3.5 mx-auto" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((kpi) => (
              <tr
                key={kpi.kpiId}
                className="border-b last:border-0 hover:bg-muted/20 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{kpi.kpiName}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {kpi.postingEventTypes.length > 0 ? (
                      kpi.postingEventTypes.map((et) => (
                        <Badge key={et} variant="outline" className="font-mono text-[10px] mr-1">
                          {et}
                        </Badge>
                      ))
                    ) : (
                      <span className="italic">No posting events</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {formatCurrency(kpi.sourceTotal)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {formatCurrency(kpi.ledgerTotal)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {formatCurrency(kpi.displayedTotal)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {kpi.delta === null ? (
                    '--'
                  ) : kpi.delta === '0.00' ? (
                    <span className="text-green-600 dark:text-green-400">0.00</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">{formatCurrency(kpi.delta)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={kpi.status} />
                </td>
                <td className="px-4 py-3 text-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="left" className="max-w-xs text-xs space-y-2">
                      <p><strong>Source:</strong> {kpi.sourceQueryBasis}</p>
                      <p><strong>Ledger:</strong> {kpi.ledgerQueryBasis}</p>
                      <p>
                        {kpi.sourceRecordCount} source record{kpi.sourceRecordCount !== 1 ? 's' : ''},
                        {' '}{kpi.postingEventCount} posting event{kpi.postingEventCount !== 1 ? 's' : ''}
                      </p>
                      {kpi.legacyGapNote && (
                        <div className="rounded border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 p-2">
                          <p className="font-medium text-amber-800 dark:text-amber-300">Reconciliation Note</p>
                          <p className="text-amber-700 dark:text-amber-400 mt-0.5">{kpi.legacyGapNote}</p>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
