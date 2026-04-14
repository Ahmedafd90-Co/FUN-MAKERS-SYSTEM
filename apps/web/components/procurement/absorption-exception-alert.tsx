'use client';

import { AlertTriangle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { trpc } from '@/lib/trpc-client';

/**
 * Shows unresolved BudgetAbsorptionExceptions for a specific record.
 *
 * This is the operator-facing proof that an absorption failure was NOT
 * silently skipped — it was recorded and is visible here.
 *
 * If there are no exceptions, nothing renders.
 */
export function AbsorptionExceptionAlert({
  projectId,
  sourceRecordType,
  sourceRecordId,
}: {
  projectId: string;
  sourceRecordType: string;
  sourceRecordId: string;
}) {
  const { data: exceptions } = trpc.budget.exceptions.useQuery({
    projectId,
    sourceRecordType,
    sourceRecordId,
  });

  if (!exceptions || exceptions.length === 0) return null;

  const openExceptions = exceptions.filter((e) => e.status === 'open');

  return (
    <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          Budget Absorption {openExceptions.length > 0 ? 'Failed' : 'Exception History'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {exceptions.map((ex) => (
            <div
              key={ex.id}
              className="rounded border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-amber-800 dark:text-amber-300">
                  {ex.absorptionType.replace(/_/g, ' ')}
                </span>
                <span
                  className={
                    ex.status === 'open'
                      ? 'text-xs font-medium text-amber-700 dark:text-amber-400'
                      : 'text-xs text-muted-foreground'
                  }
                >
                  {ex.status === 'open' ? 'UNRESOLVED' : 'Resolved'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{ex.message}</p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                Reason: {ex.reasonCode.replace(/_/g, ' ')} &middot;{' '}
                {new Date(ex.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        {openExceptions.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-3">
            This record transitioned successfully, but its cost was NOT absorbed into the project budget.
            An admin must resolve the mapping issue and re-run absorption.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
