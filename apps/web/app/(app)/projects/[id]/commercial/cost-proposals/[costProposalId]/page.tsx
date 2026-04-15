'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { trpc } from '@/lib/trpc-client';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { TransitionActions } from '@/components/commercial/transition-actions';
import { WorkflowStatusCard } from '@/components/workflow/workflow-status-card';
import { WorkflowStatusHint } from '@/components/workflow/workflow-status-hint';
import { formatMoney, Field, SummaryItem, SummaryStrip } from '@/components/commercial/shared';

function StageRow({
  stage,
  cost,
  time,
  currency,
}: {
  stage: string;
  cost: unknown;
  time: unknown;
  currency: string;
}) {
  const hasCost = cost != null;
  const hasTime = time != null;
  if (!hasCost && !hasTime) return null;
  return (
    <div className="grid grid-cols-2 gap-4 py-2 border-b last:border-0">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          {stage} — Cost
        </p>
        <p className="text-sm font-medium">
          {hasCost ? `${formatMoney(cost)} ${currency}` : '—'}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          {stage} — Time (days)
        </p>
        <p className="text-sm font-medium">
          {hasTime ? String(time) : '—'}
        </p>
      </div>
    </div>
  );
}

export default function CostProposalDetailPage() {
  const params = useParams<{ id: string; costProposalId: string }>();
  const utils = trpc.useUtils();

  const { data: me } = trpc.auth.me.useQuery();

  const { data, isLoading, error } =
    trpc.commercial.costProposal.get.useQuery({
      projectId: params.id,
      id: params.costProposalId,
    });

  const transitionMut = trpc.commercial.costProposal.transition.useMutation({
    onSuccess: () => {
      utils.commercial.costProposal.get.invalidate();
      utils.workflow.instances.getByRecord.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? 'Transition failed');
    },
  });

  // Workflow instance drives approve/return/reject when present — these
  // actions are hidden from the transition bar and handled by the workflow.
  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'cost_proposal', recordId: params.costProposalId },
    { refetchInterval: 30_000 },
  );
  const hasActiveWorkflow =
    workflowData != null &&
    ['in_progress', 'returned'].includes(workflowData.status);

  if (isLoading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error?.message ?? 'Cost Proposal not found.'}
      </div>
    );
  }

  // Best available cost for summary
  const primaryCost =
    data.approvedCost ?? data.assessedCost ?? data.estimatedCost;

  // Variation reference from the included relation
  const linkedVar = (data as any).variation as
    | { id: string; referenceNumber: string | null; subtype: string }
    | null
    | undefined;
  const varLabel = linkedVar
    ? linkedVar.referenceNumber ?? `Linked ${linkedVar.subtype === 'change_order' ? 'CO' : 'VO'}`
    : null;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/commercial/cost-proposals`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Cost Proposals
      </Link>

      {/* ── Record Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">
              {data.referenceNumber ?? 'Cost Proposal'}
            </h1>
            <CommercialStatusBadge status={data.status} />
          </div>
          {data.revisionNumber != null && (
            <p className="text-sm text-muted-foreground">
              Revision {data.revisionNumber}
            </p>
          )}
          <WorkflowStatusHint
            recordStatus={data.status}
            hasActiveWorkflow={hasActiveWorkflow}
            recordLabel="Cost Proposal"
          />
        </div>
        <TransitionActions
          currentStatus={data.status}
          recordFamily="costProposal"
          permissions={me?.permissions ?? []}
          isLoading={transitionMut.isPending}
          hasActiveWorkflow={hasActiveWorkflow}
          onTransition={async (action, comment) => {
            await transitionMut.mutateAsync({
              projectId: params.id,
              id: params.costProposalId,
              action,
              comment,
            });
          }}
        />
      </div>

      {/* ── Workflow (renders null when no instance exists) ── */}
      <WorkflowStatusCard recordType="cost_proposal" recordId={params.costProposalId} />

      {/* ── Summary Strip ── */}
      <SummaryStrip>
        <SummaryItem
          label="Estimated Cost"
          value={
            primaryCost != null
              ? `${formatMoney(primaryCost)} ${data.currency}`
              : 'Not entered'
          }
          emphasis={primaryCost != null}
        />
        <SummaryItem label="Status" value={<CommercialStatusBadge status={data.status} />} />
        <SummaryItem
          label="Revision"
          value={data.revisionNumber != null ? `Rev ${data.revisionNumber}` : '—'}
        />
        <SummaryItem
          label="Linked Variation"
          value={
            data.variationId ? (
              <Link
                href={`/projects/${params.id}/commercial/variations/${data.variationId}`}
                className="text-primary hover:underline text-xs"
              >
                {varLabel}
              </Link>
            ) : (
              'None'
            )
          }
        />
        <SummaryItem label="Currency" value={data.currency} />
        <SummaryItem
          label="Created"
          value={new Date(data.createdAt).toLocaleDateString()}
        />
      </SummaryStrip>

      {/* ── Three-stage cost/time tracking ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Cost &amp; Time Tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <StageRow
            stage="Estimated"
            cost={data.estimatedCost}
            time={data.estimatedTimeDays}
            currency={data.currency}
          />
          <StageRow
            stage="Assessed"
            cost={data.assessedCost}
            time={data.assessedTimeDays}
            currency={data.currency}
          />
          <StageRow
            stage="Approved"
            cost={data.approvedCost}
            time={data.approvedTimeDays}
            currency={data.currency}
          />
          {data.estimatedCost == null &&
            data.assessedCost == null &&
            data.approvedCost == null && (
              <p className="text-sm text-muted-foreground py-2">
                No cost/time data entered yet.
              </p>
            )}
        </CardContent>
      </Card>

      {/* ── Details ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Currency" value={data.currency} />
          {data.variationId && (
            <Field
              label="Linked Variation"
              value={
                <Link
                  href={`/projects/${params.id}/commercial/variations/${data.variationId}`}
                  className="text-primary hover:underline"
                >
                  {varLabel}
                </Link>
              }
            />
          )}
          <Field
            label="Created"
            value={new Date(data.createdAt).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      {/* ── Methodology ── */}
      {data.methodology && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Methodology</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{data.methodology}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
