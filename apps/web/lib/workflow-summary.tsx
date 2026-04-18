/**
 * Workflow summary cell — truthful one-liner for the detail-page summary strip.
 *
 * Replaces the earlier pattern where a missing workflow instance surfaced as
 * "—", which was indistinguishable from "data unknown". The truthful mapping:
 *
 *   ┌─ with workflow instance ──────────────────────────────────────────────┐
 *   │ in_progress  → "Review · PM Review"    (outcome verb + current step)  │
 *   │ returned     → "Returned · PM Review"  (warning tone)                 │
 *   │ approved     → "Approved"              (positive tone)                │
 *   │ rejected     → "Rejected"              (destructive tone)             │
 *   │ cancelled    → "Cancelled"             (muted)                        │
 *   │ completed    → "Completed"             (positive tone)                │
 *   │ on_hold      → "On hold"               (warning tone)                 │
 *   │ draft        → "Not started"           (muted)                        │
 *   └───────────────────────────────────────────────────────────────────────┘
 *
 *   ┌─ no workflow instance ────────────────────────────────────────────────┐
 *   │ record status === 'draft' → "Not started"                             │
 *   │ otherwise                 → "No workflow"                             │
 *   └───────────────────────────────────────────────────────────────────────┘
 *
 * Never returns "—". If we don't know, we say "No workflow" — that's truthful.
 */

import { cn } from '@fmksa/ui/lib/utils';
import { outcomeShortLabel } from './outcome-labels';

type Tone = 'muted' | 'default' | 'positive' | 'warning' | 'negative';

export type WorkflowSummary = {
  text: string;
  tone: Tone;
};

type WorkflowInstanceLike = {
  status: string;
  // Permissive shape: `currentStep` comes from a Prisma `find` that can return
  // `undefined`, and the real object has many more fields than we care about.
  // Only `name` and `outcomeType` are consumed here.
  currentStep?:
    | { name?: string | null; outcomeType?: string | null }
    | null
    | undefined;
} | null | undefined;

/**
 * Derive the summary cell content from a workflow instance + record status.
 *
 * Input:
 *   workflowData — result of `trpc.workflow.instances.getByRecord`
 *   recordStatus — the business-state string on the record (e.g. `draft`,
 *                  `approved_internal`, `issued`, `paid`)
 */
export function deriveWorkflowSummary(
  workflowData: WorkflowInstanceLike,
  recordStatus: string | null | undefined,
): WorkflowSummary {
  if (workflowData) {
    const stepName = workflowData.currentStep?.name;
    const outcome = workflowData.currentStep?.outcomeType;

    switch (workflowData.status) {
      case 'in_progress':
        return stepName
          ? { text: `${outcomeShortLabel(outcome)} · ${stepName}`, tone: 'default' }
          : { text: 'In progress', tone: 'default' };
      case 'returned':
        return stepName
          ? { text: `Returned · ${stepName}`, tone: 'warning' }
          : { text: 'Returned', tone: 'warning' };
      case 'approved':
        return { text: 'Approved', tone: 'positive' };
      case 'completed':
        return { text: 'Completed', tone: 'positive' };
      case 'rejected':
        return { text: 'Rejected', tone: 'negative' };
      case 'cancelled':
        return { text: 'Cancelled', tone: 'muted' };
      case 'on_hold':
        return { text: 'On hold', tone: 'warning' };
      case 'draft':
        return { text: 'Not started', tone: 'muted' };
      default:
        // Unknown status — surface it verbatim rather than hide it
        return { text: workflowData.status, tone: 'default' };
    }
  }

  // No workflow instance — distinguish draft-record from records that
  // simply don't use workflow (or haven't started one yet).
  if (recordStatus === 'draft') {
    return { text: 'Not started', tone: 'muted' };
  }
  return { text: 'No workflow', tone: 'muted' };
}

/**
 * Render a workflow summary inside a `SummaryItem`'s value slot.
 *
 * Kept here (not in shared.tsx) because tone classes are specific to this
 * summary's semantics — the generic SummaryItem's `destructive` prop is for
 * money-negative numbers, not workflow states.
 */
export function WorkflowSummaryValue({ summary }: { summary: WorkflowSummary }) {
  const toneClass = TONE_CLASSES[summary.tone];
  return <span className={cn('truncate', toneClass)}>{summary.text}</span>;
}

const TONE_CLASSES: Record<Tone, string> = {
  muted: 'text-muted-foreground',
  default: 'text-foreground',
  positive: 'text-emerald-700 dark:text-emerald-400 font-medium',
  warning: 'text-amber-700 dark:text-amber-400 font-medium',
  negative: 'text-destructive font-medium',
};
