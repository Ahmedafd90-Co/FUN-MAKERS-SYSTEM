'use client';

import { cn } from '@fmksa/ui/lib/utils';
import {
  deriveRegisterWorkflowSummary,
  type WorkflowSummary,
} from '@/lib/workflow-summary';

type InstanceSummary = {
  status: string;
  currentStep: { name: string; outcomeType: string | null } | null;
  lastReturnActor: string | null;
} | null;

type Props = {
  instance: InstanceSummary | undefined;
  recordStatus: string | null | undefined;
  isLoading?: boolean;
};

/**
 * Compact workflow cell for register tables. Relies on the parent to batch-
 * fetch workflow summaries via `workflow.instances.listByRecords` and pass
 * the per-row result in `instance`:
 *   - `undefined` → still loading
 *   - `null`      → no workflow instance for this record
 *   - object      → summary payload from the batch endpoint
 */
export function WorkflowRegisterCell({ instance, recordStatus, isLoading }: Props) {
  if (isLoading && instance === undefined) {
    return <span className="inline-block h-3 w-20 animate-pulse rounded bg-muted" />;
  }
  const summary = deriveRegisterWorkflowSummary(instance ?? null, recordStatus);
  return <WorkflowRegisterText summary={summary} />;
}

function WorkflowRegisterText({ summary }: { summary: WorkflowSummary }) {
  return (
    <span
      className={cn(
        'block text-xs truncate max-w-[180px]',
        TONE_CLASSES[summary.tone],
      )}
      title={summary.text}
    >
      {summary.text}
    </span>
  );
}

const TONE_CLASSES: Record<WorkflowSummary['tone'], string> = {
  muted: 'text-muted-foreground',
  default: 'text-foreground',
  positive: 'text-emerald-700 dark:text-emerald-400 font-medium',
  warning: 'text-amber-700 dark:text-amber-400 font-medium',
  negative: 'text-destructive font-medium',
};
