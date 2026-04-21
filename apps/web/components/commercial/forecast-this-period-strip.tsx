'use client';

import Link from 'next/link';
import { TrendingDown, TrendingUp, Minus, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';

function formatMoney(val: string | null): string {
  if (val == null) return '—';
  const num = parseFloat(val);
  if (isNaN(num)) return '—';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Compact "this period" forecast strip for the IPA register.
 *
 * Hidden entirely when no forecast covers the current calendar month —
 * we never render empty "—" strips that create noise.
 *
 * Variance color: green = ahead, amber = behind, neutral = on plan.
 * "Actual" here = the matching IPA's netClaimed if approved+, else 0.00.
 */
export function ForecastThisPeriodStrip({ projectId }: { projectId: string }) {
  const { data, isLoading, error } = trpc.commercial.forecast.forecastVsActual.useQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  // Hide on loading, permission denied, or when no forecast covers this month
  if (isLoading) return null;
  if (error) return null; // FORBIDDEN is expected for some roles — render nothing
  if (!data || data.thisMonth.periodNumber == null) return null;

  const forecast = data.thisMonth.forecastAmount ?? '0.00';
  const actual = data.thisMonth.actualAmount ?? '0.00';
  const forecastNum = parseFloat(forecast);
  const actualNum = parseFloat(actual);
  const variance = (actualNum - forecastNum).toFixed(2);
  const varianceNum = actualNum - forecastNum;

  const trendIcon =
    varianceNum > 0 ? (
      <TrendingUp className="h-3 w-3" />
    ) : varianceNum < 0 ? (
      <TrendingDown className="h-3 w-3" />
    ) : (
      <Minus className="h-3 w-3" />
    );
  const varianceClass =
    varianceNum > 0
      ? 'text-green-600 dark:text-green-400'
      : varianceNum < 0
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground';

  const periodStart = data.thisMonth.periodStart
    ? new Date(data.thisMonth.periodStart).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
      })
    : '';

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <span className="font-medium">
        Period {data.thisMonth.periodNumber}
        {periodStart ? ` · ${periodStart}` : ''}
      </span>
      <span className="text-muted-foreground">
        Forecast:{' '}
        <span className="font-mono tabular-nums text-foreground">{formatMoney(forecast)}</span>{' '}
        {data.currency}
      </span>
      <span className="text-muted-foreground">
        Actual:{' '}
        <span className="font-mono tabular-nums text-foreground">{formatMoney(actual)}</span>{' '}
        {data.currency}
      </span>
      <span className={`inline-flex items-center gap-1 font-medium ${varianceClass}`}>
        {trendIcon}
        Variance:{' '}
        <span className="font-mono tabular-nums">{formatMoney(variance)}</span> {data.currency}
      </span>
      <Link
        href={`/projects/${projectId}/commercial/forecast`}
        className="ml-auto inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        Manage forecast
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
