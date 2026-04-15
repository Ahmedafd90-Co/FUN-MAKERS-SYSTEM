'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { trpc } from '@/lib/trpc-client';

type Variant = 'actual' | 'reversal';

function formatMoney(val: unknown): string {
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

/**
 * Budget Impact card — renders the "absorbed as actual cost" claim only
 * when absorption actually succeeded (no open BudgetAbsorptionException
 * for this record).
 *
 * If there is an unresolved absorption exception, this card is suppressed
 * and the AbsorptionExceptionAlert tells the truth (absorption failed,
 * admin must fix the mapping).
 *
 * This keeps the UI from claiming a budget impact that never happened.
 */
export function BudgetImpactCard({
  projectId,
  sourceRecordType,
  sourceRecordId,
  amount,
  currency,
  recordLabel,
  variant = 'actual',
}: {
  projectId: string;
  sourceRecordType: string;
  sourceRecordId: string;
  amount: unknown;
  currency: string;
  recordLabel: string;
  variant?: Variant;
}) {
  const { data: exceptions, isLoading } = trpc.budget.exceptions.useQuery({
    projectId,
    sourceRecordType,
    sourceRecordId,
  });

  // While loading, don't render — avoids a flicker of a claim that may
  // not be true once exceptions load.
  if (isLoading) return null;

  const hasOpenException = exceptions?.some((e) => e.status === 'open') ?? false;
  if (hasOpenException) return null;

  const isReversal = variant === 'reversal';

  return (
    <Card
      className={isReversal ? 'border-amber-500/30' : 'border-green-500/30'}
    >
      <CardHeader>
        <CardTitle className="text-sm">Budget Impact</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This {recordLabel} has been{' '}
          {isReversal ? 'applied to' : 'absorbed into'} the project budget as
          an{' '}
          <span className="font-medium text-foreground">
            {isReversal ? 'actual cost reversal' : 'actual cost'}
          </span>{' '}
          of{' '}
          <span className="font-medium tabular-nums">
            {formatMoney(amount)} {currency}
          </span>
          .
        </p>
      </CardContent>
    </Card>
  );
}
