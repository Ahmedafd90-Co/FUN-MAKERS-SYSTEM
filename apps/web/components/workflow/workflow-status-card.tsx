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
  Eye,
  FileSignature,
  Send,
  ClipboardCheck,
  type LucideIcon,
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

        {/* ── Route ribbon ── */}
        {data.template?.steps && data.template.steps.length > 0 && (
          <WorkflowRouteRibbon
            steps={data.template.steps}
            currentStepId={data.currentStepId}
            currentStepOrderIndex={
              (data.currentStep as { orderIndex: number } | null)?.orderIndex ?? null
            }
            actions={(data.actions ?? []) as RibbonAction[]}
            status={data.status}
          />
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
// Route ribbon — premium step path visualization above the card body.
//
// Renders one pill per step with:
//   - state dot (outcome icon or check / current arrow / rejected X)
//   - step name
//   - actor + date under completed steps (only if we have an 'approved'
//     action on that step — we don't fabricate actor info)
//
// The ribbon is a denser, more readable evolution of the previous numbered-
// circle strip. It reads as an operational route, not a progress bar.
// ---------------------------------------------------------------------------

type RibbonStep = {
  id: string;
  orderIndex: number;
  name: string;
  outcomeType?: string | undefined;
};

type RibbonAction = {
  action: string;
  actedAt: string | Date;
  actor?: { name: string } | null;
  step?: { id: string } | null;
  stepId?: string;
};

type StepState = 'completed' | 'current' | 'rejected' | 'pending';

function WorkflowRouteRibbon({
  steps,
  currentStepId,
  currentStepOrderIndex,
  actions,
  status,
}: {
  steps: RibbonStep[];
  currentStepId: string | null;
  currentStepOrderIndex: number | null;
  actions: RibbonAction[];
  status: string;
}) {
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';

  // Pre-compute the completing action per step (latest approval action on
  // that step). Used to surface actor + date under completed cells.
  // The workflow service writes 'approved'; some demo/seed paths write the
  // shorter 'approve' — accept both so the ribbon is truthful in either case.
  const completingActionByStep = new Map<string, RibbonAction>();
  for (const a of actions) {
    if (a.action !== 'approved' && a.action !== 'approve') continue;
    const stepId = a.step?.id ?? a.stepId;
    if (!stepId) continue;
    // If multiple approvals exist (e.g. return → re-approve), keep the latest.
    const existing = completingActionByStep.get(stepId);
    if (!existing || new Date(a.actedAt) > new Date(existing.actedAt)) {
      completingActionByStep.set(stepId, a);
    }
  }

  // For rejected instances, currentStepId is cleared by the service — so we
  // recover the rejection step from the latest reject action. Without this,
  // the ribbon would show every step as pending on a rejected workflow.
  let rejectedStepId: string | null = null;
  if (isRejected) {
    let latestReject: RibbonAction | null = null;
    for (const a of actions) {
      if (a.action !== 'rejected' && a.action !== 'reject') continue;
      if (!latestReject || new Date(a.actedAt) > new Date(latestReject.actedAt)) {
        latestReject = a;
      }
    }
    rejectedStepId = latestReject?.step?.id ?? latestReject?.stepId ?? null;
  }
  const rejectedStep = rejectedStepId
    ? steps.find((s) => s.id === rejectedStepId) ?? null
    : null;
  const rejectedOrderIndex = rejectedStep?.orderIndex ?? null;

  const stateFor = (step: RibbonStep): StepState => {
    if (isApproved) return 'completed';
    if (isRejected) {
      if (rejectedStepId && step.id === rejectedStepId) return 'rejected';
      if (rejectedOrderIndex != null && step.orderIndex < rejectedOrderIndex) {
        return 'completed';
      }
      return 'pending';
    }
    if (step.id === currentStepId) return 'current';
    if (currentStepOrderIndex != null && step.orderIndex < currentStepOrderIndex) {
      return 'completed';
    }
    return 'pending';
  };

  return (
    <div className="space-y-2">
      {/* Dots row + connectors */}
      <div className="flex items-stretch gap-1">
        {steps.map((step, i) => {
          const state = stateFor(step);
          const isLast = i === steps.length - 1;
          return (
            <div key={step.id} className="flex items-center gap-1 flex-1 min-w-0">
              <RibbonDot state={state} outcomeType={step.outcomeType} />
              {!isLast && <RibbonConnector leftState={state} />}
            </div>
          );
        })}
      </div>

      {/* Labels row — step name + optional actor/date under completed cells */}
      <div className="flex justify-between gap-1">
        {steps.map((step) => {
          const state = stateFor(step);
          const completing = completingActionByStep.get(step.id);
          return (
            <div
              key={step.id}
              className="flex-1 min-w-0 text-center space-y-0.5 px-0.5"
            >
              <p
                className={cn(
                  'text-[11px] leading-tight truncate',
                  state === 'current' && 'text-foreground font-semibold',
                  state === 'completed' && 'text-foreground',
                  state === 'rejected' && 'text-destructive font-semibold',
                  state === 'pending' && 'text-muted-foreground',
                )}
                title={step.name}
              >
                {step.name}
              </p>
              {state === 'completed' && completing?.actor?.name && (
                <p
                  className="text-[10px] leading-tight text-muted-foreground truncate"
                  title={`${completing.actor.name} · ${new Date(completing.actedAt).toLocaleDateString()}`}
                >
                  <span className="truncate">{completing.actor.name}</span>
                  <span className="text-muted-foreground/50">
                    {' · '}
                    {formatShortDate(completing.actedAt)}
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RibbonDot({
  state,
  outcomeType,
}: {
  state: StepState;
  outcomeType?: string | undefined;
}) {
  const Icon = outcomeIcon(outcomeType);
  const common =
    'flex items-center justify-center h-8 w-8 rounded-full shrink-0 transition-colors';
  switch (state) {
    case 'completed':
      return (
        <div
          className={cn(
            common,
            'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
        </div>
      );
    case 'current':
      return (
        <div
          className={cn(
            common,
            'bg-primary text-primary-foreground ring-2 ring-primary/25',
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      );
    case 'rejected':
      return (
        <div
          className={cn(
            common,
            'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
          )}
        >
          <XCircle className="h-4 w-4" />
        </div>
      );
    case 'pending':
    default:
      return (
        <div
          className={cn(
            common,
            'bg-muted text-muted-foreground/70 ring-1 ring-inset ring-border',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      );
  }
}

function RibbonConnector({ leftState }: { leftState: StepState }) {
  // Line colour reflects the state of the step on the LEFT of the connector.
  // Completed → emerald; anything else → muted.
  const completed = leftState === 'completed';
  return (
    <div
      className={cn(
        'h-0.5 flex-1 rounded-full',
        completed ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-muted',
      )}
    />
  );
}

/** Map a step's outcomeType to a Lucide icon. Defaults to CheckCircle2. */
function outcomeIcon(outcomeType?: string | undefined): LucideIcon {
  switch (outcomeType) {
    case 'review':
      return Eye;
    case 'sign':
      return FileSignature;
    case 'issue':
      return Send;
    case 'acknowledge':
      return ClipboardCheck;
    case 'approve':
    default:
      return CheckCircle2;
  }
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
