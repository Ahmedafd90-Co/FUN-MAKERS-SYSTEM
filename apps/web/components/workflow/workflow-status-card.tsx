'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { cn } from '@fmksa/ui/lib/utils';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  RotateCcw,
  User,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { trpc } from '@/lib/trpc-client';
import { outcomeCompletedLabel, outcomePendingLabel } from '@/lib/outcome-labels';

type Props = {
  recordType: string;
  recordId: string;
};

export function WorkflowStatusCard({ recordType, recordId }: Props) {
  const { data, isLoading } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType, recordId },
    { refetchInterval: 30_000 },
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b bg-muted/30">
          <div className="h-4 w-36 animate-pulse rounded bg-muted" />
        </div>
        <div className="p-4 space-y-3">
          <div className="h-6 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isActive = ['in_progress', 'returned'].includes(data.status);
  const isApproved = data.status === 'approved';
  const isRejected = data.status === 'rejected';
  const isReturned = data.status === 'returned';

  // Header styling per state
  const headerClass = cn(
    'px-4 py-3 border-b flex items-center justify-between gap-3',
    isApproved && 'bg-emerald-50 dark:bg-emerald-950/50',
    isRejected && 'bg-red-50 dark:bg-red-950/50',
    isReturned && 'bg-amber-50 dark:bg-amber-950/50',
    !isApproved && !isRejected && !isReturned && 'bg-muted/30',
  );

  // Latest meaningful event (skip "started" if there are better events)
  const actions = data.actions ?? [];
  const meaningfulActions = actions.filter(
    (a: { action: string }) => a.action !== 'started' && a.action !== 'resubmitted',
  );
  const latestEvent =
    meaningfulActions.length > 0
      ? meaningfulActions[meaningfulActions.length - 1]
      : actions.length > 0
        ? actions[actions.length - 1]
        : null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* ── Header ── */}
      <div className={headerClass}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <WorkflowStateIcon status={data.status} />
            <span className="text-sm font-medium">Approval Workflow</span>
            <WorkflowStatusBadge status={data.status} />
          </div>
          {data.template && (
            <div className="ml-6 mt-0.5 space-y-0">
              <p className="text-[11px] text-muted-foreground font-mono">
                {(data.template as { name: string; code: string }).name}{' '}
                <span className="text-muted-foreground/60">
                  ({(data.template as { code: string }).code})
                </span>
              </p>
              {(data as any).resolutionSource && (
                <p className="text-[10px] text-muted-foreground/50">
                  Resolved via: {resolutionSourceLabel((data as any).resolutionSource)}
                </p>
              )}
            </div>
          )}
        </div>
        {/* Latest event — right side */}
        {latestEvent && (
          <div className="text-right shrink-0 hidden sm:block">
            <p className="text-[11px] text-muted-foreground">Last action</p>
            <p className="text-xs font-medium">
              {actionLabel((latestEvent as any).action, (latestEvent as any).step?.outcomeType)}
              {(latestEvent as any).actor?.name && (
                <span className="font-normal text-muted-foreground">
                  {' '}by {(latestEvent as any).actor.name}
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* ── Returned guidance ── */}
        {isReturned && actions.length > 0 && (() => {
          const lastReturn = [...actions].reverse().find(
            (a: { action: string }) => a.action === 'returned',
          );
          if (!lastReturn) return null;
          return (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-3 py-2.5 space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Returned by {(lastReturn as any).actor?.name ?? 'an approver'}
              </p>
              {(lastReturn as any).comment && (
                <p className="text-sm text-amber-700 dark:text-amber-300 italic">
                  &ldquo;{(lastReturn as any).comment}&rdquo;
                </p>
              )}
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Make changes, then re-submit to continue the workflow.
              </p>
            </div>
          );
        })()}

        {/* ── Rejected info ── */}
        {isRejected && actions.length > 0 && (() => {
          const lastReject = [...actions].reverse().find(
            (a: { action: string }) => a.action === 'rejected',
          );
          if (!lastReject) return null;
          return (
            <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 px-3 py-2.5 space-y-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Rejected by {(lastReject as any).actor?.name ?? 'an approver'}
              </p>
              {(lastReject as any).comment && (
                <p className="text-sm text-red-700 dark:text-red-300 italic">
                  &ldquo;{(lastReject as any).comment}&rdquo;
                </p>
              )}
              <p className="text-xs text-red-600 dark:text-red-400">
                This workflow is terminal. The record cannot proceed through this approval path.
              </p>
            </div>
          );
        })()}

        {/* ── Step progress ── */}
        {data.template?.steps && data.template.steps.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              {data.template.steps.map(
                (step: { id: string; orderIndex: number; name: string }, i: number) => {
                  const isCurrent = step.id === data.currentStepId;
                  const isPast = data.currentStep
                    ? step.orderIndex < (data.currentStep as { orderIndex: number }).orderIndex
                    : isApproved;
                  const completedAll = isApproved;
                  const isRejectedStep = isRejected && isCurrent;

                  return (
                    <div key={step.id} className="flex items-center gap-1 flex-1">
                      <div
                        className={cn(
                          'flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium shrink-0 transition-colors',
                          completedAll || isPast
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                            : isRejectedStep
                              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                              : isCurrent
                                ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                                : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {completedAll || isPast ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : isRejectedStep ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          i + 1
                        )}
                      </div>
                      {i < data.template.steps.length - 1 && (
                        <div
                          className={cn(
                            'h-0.5 flex-1 rounded-full transition-colors',
                            completedAll || isPast
                              ? 'bg-emerald-300 dark:bg-emerald-700'
                              : 'bg-muted',
                          )}
                        />
                      )}
                    </div>
                  );
                },
              )}
            </div>
            <div className="flex justify-between">
              {data.template.steps.map((step: { id: string; name: string }) => (
                <span
                  key={step.id}
                  className={cn(
                    'text-[10px] leading-tight text-center flex-1',
                    step.id === data.currentStepId
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground',
                  )}
                >
                  {step.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Current step + approvers (active only) ── */}
        {isActive && data.currentStep && !isReturned && (
          <div className="rounded-md border bg-muted/20 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-sm font-medium">
                  {(data.currentStep as { name: string }).name}
                </span>
              </div>
              {data.slaInfo && (
                <SlaIndicator
                  slaInfo={
                    data.slaInfo as {
                      isBreached: boolean;
                      hoursRemaining: number | null;
                      currentStepSlaHours: number | null;
                    }
                  }
                />
              )}
            </div>
            {data.currentApprovers && data.currentApprovers.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {outcomePendingLabel(
                    (data.currentStep as any)?.outcomeType,
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.currentApprovers.map(
                    (approver: { id: string; name: string }) => (
                      <span
                        key={approver.id}
                        className="inline-flex items-center gap-1 rounded-full bg-background border px-2 py-0.5 text-xs"
                      >
                        <User className="h-3 w-3 text-muted-foreground" />
                        {approver.name}
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Completed banner ── */}
        {isApproved && (
          <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-800 dark:text-emerald-200 font-medium">
              All approval steps completed
            </p>
          </div>
        )}

        {/* ── History ── */}
        {actions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              History
            </p>
            <div className="space-y-1">
              {actions.map(
                (
                  action: {
                    action: string;
                    comment?: string | null;
                    actedAt: string | Date;
                    actor?: { name: string };
                    step?: { name: string; outcomeType?: string };
                  },
                  i: number,
                ) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs py-1 border-b border-border/50 last:border-0"
                  >
                    <ActionIcon action={action.action} />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">
                        {actionLabel(action.action, action.step?.outcomeType)}
                      </span>
                      {action.step?.name && (
                        <span className="text-muted-foreground">
                          {' '}
                          at &ldquo;{action.step.name}&rdquo;
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {' '}
                        &middot; {action.actor?.name ?? 'System'}
                      </span>
                      {action.comment && (
                        <p className="text-muted-foreground mt-0.5 italic truncate">
                          &ldquo;{action.comment}&rdquo;
                        </p>
                      )}
                    </div>
                    <span className="text-muted-foreground/60 whitespace-nowrap shrink-0 tabular-nums">
                      {formatShortDate(action.actedAt)}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolutionSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    project_override: 'Project Override',
    entity_default: 'Entity Default',
    system_default: 'System Default',
  };
  return labels[source] ?? source;
}

function formatShortDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function actionLabel(action: string, stepOutcomeType?: string): string {
  if (action === 'approved') {
    return outcomeCompletedLabel(stepOutcomeType);
  }
  const labels: Record<string, string> = {
    started: 'Workflow started',
    rejected: 'Rejected',
    returned: 'Returned',
    resubmitted: 'Re-submitted',
  };
  return labels[action] ?? action;
}

function WorkflowStateIcon({ status }: { status: string }) {
  const size = 'h-4 w-4 shrink-0';
  switch (status) {
    case 'approved':
      return <CheckCircle2 className={cn(size, 'text-emerald-600')} />;
    case 'rejected':
      return <XCircle className={cn(size, 'text-red-600')} />;
    case 'returned':
      return <RotateCcw className={cn(size, 'text-amber-600')} />;
    case 'in_progress':
      return <Clock className={cn(size, 'text-blue-600')} />;
    default:
      return <Clock className={cn(size, 'text-muted-foreground')} />;
  }
}

function WorkflowStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'in_progress':
      return (
        <Badge
          variant="secondary"
          className="text-[11px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
        >
          In Progress
        </Badge>
      );
    case 'returned':
      return (
        <Badge
          variant="secondary"
          className="text-[11px] bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200"
        >
          Returned
        </Badge>
      );
    case 'approved':
      return (
        <Badge
          variant="secondary"
          className="text-[11px] bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200"
        >
          Completed
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="destructive" className="text-[11px]">
          Rejected
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="outline" className="text-[11px]">
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[11px] capitalize">
          {status}
        </Badge>
      );
  }
}

function SlaIndicator({
  slaInfo,
}: {
  slaInfo: {
    isBreached: boolean;
    hoursRemaining: number | null;
    currentStepSlaHours: number | null;
  };
}) {
  if (!slaInfo.currentStepSlaHours) return null;

  if (slaInfo.isBreached) {
    return (
      <Badge variant="destructive" className="text-[11px]">
        <AlertTriangle className="h-3 w-3 mr-1" />
        SLA Breached
      </Badge>
    );
  }

  if (slaInfo.hoursRemaining != null && slaInfo.hoursRemaining <= 4) {
    return (
      <Badge
        variant="secondary"
        className="text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
      >
        <Clock className="h-3 w-3 mr-1" />
        {Math.round(slaInfo.hoursRemaining)}h left
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="text-[11px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
    >
      <Clock className="h-3 w-3 mr-1" />
      {slaInfo.hoursRemaining != null
        ? `${Math.round(slaInfo.hoursRemaining)}h left`
        : 'On track'}
    </Badge>
  );
}

function ActionIcon({ action }: { action: string }) {
  const className = 'h-3.5 w-3.5 mt-0.5 shrink-0';
  switch (action) {
    case 'approved':
      return <CheckCircle2 className={cn(className, 'text-emerald-600')} />;
    case 'rejected':
      return <XCircle className={cn(className, 'text-red-600')} />;
    case 'returned':
      return <RotateCcw className={cn(className, 'text-amber-600')} />;
    case 'started':
      return <Clock className={cn(className, 'text-blue-600')} />;
    case 'resubmitted':
      return <ArrowRight className={cn(className, 'text-blue-600')} />;
    default:
      return <Clock className={cn(className, 'text-muted-foreground')} />;
  }
}
