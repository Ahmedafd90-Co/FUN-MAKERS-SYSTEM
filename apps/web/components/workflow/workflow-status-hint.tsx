'use client';

/**
 * Inline status hint shown next to the record status badge on detail pages.
 *
 * Bridges the gap between "record status" and "workflow status" so operators
 * understand they don't need to guess which one matters.
 */

import { Info, RotateCcw } from 'lucide-react';

type Props = {
  recordStatus: string;
  hasActiveWorkflow: boolean;
  /** e.g. "IPA", "RFQ", "Variation" — human-facing label */
  recordLabel: string;
};

export function WorkflowStatusHint({ recordStatus, hasActiveWorkflow, recordLabel }: Props) {
  // Only show the hint when there's something worth explaining
  if (!hasActiveWorkflow && recordStatus !== 'returned' && recordStatus !== 'approved_internal' && recordStatus !== 'rejected') {
    return null;
  }

  // Returned state — most important to explain clearly
  if (recordStatus === 'returned') {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
        <RotateCcw className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          <span className="font-medium">Returned for revision.</span>{' '}
          See the workflow section below for reason and next steps.
        </p>
      </div>
    );
  }

  // Submitted/under_review with active workflow
  if (hasActiveWorkflow && (recordStatus === 'submitted' || recordStatus === 'under_review')) {
    return (
      <p className="text-[11px] text-muted-foreground/70 flex items-start gap-1">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>In internal approval — see workflow below.</span>
      </p>
    );
  }

  // Approved — brief confirmation
  if (recordStatus === 'approved_internal') {
    return (
      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-start gap-1">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>Internal approval complete. Ready for next lifecycle stage.</span>
      </p>
    );
  }

  // Rejected
  if (recordStatus === 'rejected') {
    return (
      <p className="text-[11px] text-destructive flex items-start gap-1">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>Rejected during approval. See workflow below for details.</span>
      </p>
    );
  }

  return null;
}
