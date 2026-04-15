/**
 * Shared primitives for commercial detail pages.
 *
 * Eliminates duplication of formatMoney, Field, and SummaryItem
 * across IPA, IPC, Variation, Correspondence, Cost Proposal, and Tax Invoice detail pages.
 */

import { cn } from '@fmksa/ui/lib/utils';

// ---------------------------------------------------------------------------
// Money formatting
// ---------------------------------------------------------------------------

export function formatMoney(val: unknown): string {
  const num =
    typeof val === 'string'
      ? parseFloat(val)
      : typeof val === 'number'
        ? val
        : 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Rate formatting — decimal rate (0.0–1.0) → "15.00%"
// ---------------------------------------------------------------------------

/**
 * Render a decimal rate as a percent string.
 *
 * The schema stores VAT and similar multipliers as `Decimal(5,4)` in the
 * range 0.0–1.0 (e.g. 0.15 = 15%). Pages must multiply by 100 before display
 * — `parseFloat(String(rate))` alone would show "0.15%" for a 15% tax.
 *
 * @param val  Stored rate value (number, numeric string, or Decimal toString)
 * @param fractionDigits  Decimals to render (default 2, to match schema precision)
 */
export function formatRate(val: unknown, fractionDigits = 2): string {
  const num =
    typeof val === 'string'
      ? parseFloat(val)
      : typeof val === 'number'
        ? val
        : 0;
  if (!Number.isFinite(num)) return '—';
  return `${(num * 100).toFixed(fractionDigits)}%`;
}

// ---------------------------------------------------------------------------
// Field — label + value pair used in card grids
// ---------------------------------------------------------------------------

export function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <div className="text-sm mt-0.5">{value ?? '—'}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryItem — single fact inside the summary strip
// ---------------------------------------------------------------------------

export function SummaryItem({
  label,
  value,
  emphasis,
  destructive,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
  destructive?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">
        {label}
      </p>
      <div
        className={cn(
          'text-sm leading-tight truncate',
          emphasis && 'font-semibold text-foreground',
          destructive && 'font-semibold text-destructive',
        )}
      >
        {value ?? '—'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryStrip — horizontal strip of 3-6 key facts below the page header
// ---------------------------------------------------------------------------

export function SummaryStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 px-4 py-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-3">
        {children}
      </div>
    </div>
  );
}
