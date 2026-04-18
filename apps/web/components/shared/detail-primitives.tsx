/**
 * Shared primitives for record detail pages.
 *
 * Neutral helpers used across modules (commercial, procurement, …) to render
 * consistent label/value pairs and summary strips on a record detail page.
 *
 * Import from this path in new code. `@/components/commercial/shared` is kept
 * as a thin re-export shim for backward compatibility and will be retired in
 * a later lane.
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

/**
 * Column count at the `lg:` breakpoint. Below `lg`, the strip always falls
 * back to 2 cols (mobile) / 3 cols (sm). 4 cols gives cells enough room to
 * render "1,150,000.00 SAR"-style values without truncation on pages that
 * have a module-level left nav (e.g. procurement).
 */
const LG_COLS_CLASS: Record<4 | 5 | 6, string> = {
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

export function SummaryStrip({
  children,
  cols = 6,
}: {
  children: React.ReactNode;
  cols?: 4 | 5 | 6;
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-4 py-3">
      <div
        className={cn(
          'grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3',
          LG_COLS_CLASS[cols],
        )}
      >
        {children}
      </div>
    </div>
  );
}
