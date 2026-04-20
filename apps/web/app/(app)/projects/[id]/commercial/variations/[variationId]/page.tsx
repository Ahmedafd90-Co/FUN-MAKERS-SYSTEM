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
import { Badge } from '@fmksa/ui/components/badge';
import { trpc } from '@/lib/trpc-client';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { TransitionActions } from '@/components/commercial/transition-actions';
import { WorkflowStatusCard } from '@/components/workflow/workflow-status-card';
import { WorkflowStatusHint } from '@/components/workflow/workflow-status-hint';
import {
  deriveWorkflowSummary,
  WorkflowSummaryValue,
} from '@/lib/workflow-summary';
import { formatMoney, Field, SummaryItem, SummaryStrip } from '@/components/commercial/shared';

function subtypeLabel(subtype: string): string {
  return subtype === 'change_order' ? 'Change Order' : subtype.toUpperCase();
}

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

export default function VariationDetailPage() {
  const params = useParams<{ id: string; variationId: string }>();
  const utils = trpc.useUtils();

  const { data: me } = trpc.auth.me.useQuery();

  const { data, isLoading, error } = trpc.commercial.variation.get.useQuery({
    projectId: params.id,
    id: params.variationId,
  });

  const transitionMut = trpc.commercial.variation.transition.useMutation({
    onSuccess: () => {
      utils.commercial.variation.get.invalidate();
      utils.workflow.instances.getByRecord.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? 'Transition failed');
    },
  });

  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'variation', recordId: params.variationId },
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
        {error?.message ?? 'Variation not found.'}
      </div>
    );
  }

  const workflowSummary = deriveWorkflowSummary(workflowData, data.status);

  // VO client-approval action — only VOs have client_pending from issued
  const voExtraActions =
    data.subtype === 'vo' && data.status === 'issued'
      ? [{ action: 'client_pending', label: 'Send to Client', variant: 'default' as const }]
      : undefined;

  // Best available cost impact for summary
  const primaryCost =
    data.approvedCostImpact ?? data.assessedCostImpact ?? data.costImpact;
  const primaryTime =
    data.approvedTimeImpactDays ?? data.assessedTimeImpactDays ?? data.timeImpactDays;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/commercial/variations`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Variations
      </Link>

      {/* ── Record Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">
              {data.referenceNumber ??
                (data.status === 'draft'
                  ? 'Draft Variation'
                  : 'Variation (no reference)')}
            </h1>
            <Badge
              variant={data.subtype === 'change_order' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {subtypeLabel(data.subtype)}
            </Badge>
            <CommercialStatusBadge status={data.status} />
          </div>
          {data.title && (
            <p className="text-sm text-muted-foreground">{data.title}</p>
          )}
          <WorkflowStatusHint
            recordStatus={data.status}
            hasActiveWorkflow={hasActiveWorkflow}
            recordLabel="Variation"
          />
        </div>
        <TransitionActions
          currentStatus={data.status}
          recordFamily="variation"
          permissions={me?.permissions ?? []}
          isLoading={transitionMut.isPending}
          hasActiveWorkflow={hasActiveWorkflow}
          extraActions={voExtraActions}
          onTransition={async (action, comment) => {
            await transitionMut.mutateAsync({
              projectId: params.id,
              id: params.variationId,
              action,
              comment,
            });
          }}
        />
      </div>

      {/* ── Summary Strip ── */}
      <SummaryStrip>
        <SummaryItem label="Type" value={subtypeLabel(data.subtype)} />
        <SummaryItem
          label="Cost Impact"
          value={
            primaryCost != null
              ? `${formatMoney(primaryCost)} ${data.currency}`
              : 'Not assessed'
          }
          emphasis={primaryCost != null}
        />
        <SummaryItem
          label="Time Impact"
          value={
            primaryTime != null ? `${primaryTime} days` : 'Not assessed'
          }
        />
        <SummaryItem label="Status" value={<CommercialStatusBadge status={data.status} />} />
        <SummaryItem
          label="Workflow"
          value={<WorkflowSummaryValue summary={workflowSummary} />}
        />
        <SummaryItem
          label="Initiated By"
          value={
            data.initiatedBy
              ? String(data.initiatedBy).replace(/_/g, ' ')
              : '—'
          }
        />
      </SummaryStrip>

      {/* ── Workflow ── */}
      <WorkflowStatusCard
        recordType="variation"
        recordId={params.variationId}
      />

      {/* ── Three-stage tracking ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Cost &amp; Time Impact Tracking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <StageRow
            stage="Submitted"
            cost={data.costImpact}
            time={data.timeImpactDays}
            currency={data.currency}
          />
          <StageRow
            stage="Assessed"
            cost={data.assessedCostImpact}
            time={data.assessedTimeImpactDays}
            currency={data.currency}
          />
          <StageRow
            stage="Approved"
            cost={data.approvedCostImpact}
            time={data.approvedTimeImpactDays}
            currency={data.currency}
          />
          {data.costImpact == null &&
            data.assessedCostImpact == null &&
            data.approvedCostImpact == null && (
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
          <Field
            label="Initiated By"
            value={
              data.initiatedBy
                ? String(data.initiatedBy).replace(/_/g, ' ')
                : '—'
            }
          />
          <Field label="Contract Clause" value={data.contractClause ?? '—'} />
          {data.originalContractValue != null && (
            <Field
              label="Original Contract Value"
              value={`${formatMoney(data.originalContractValue)} ${data.currency}`}
            />
          )}
          {data.adjustmentAmount != null && (
            <Field
              label="Adjustment Amount"
              value={`${formatMoney(data.adjustmentAmount)} ${data.currency}`}
            />
          )}
          {data.newContractValue != null && (
            <Field
              label="New Contract Value"
              value={`${formatMoney(data.newContractValue)} ${data.currency}`}
            />
          )}
          {data.timeAdjustmentDays != null && (
            <Field
              label="Time Adjustment (days)"
              value={String(data.timeAdjustmentDays)}
            />
          )}
          <Field
            label="Created"
            value={new Date(data.createdAt).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      {/* ── Description & Reason ── */}
      {(data.description || data.reason) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Description &amp; Reason</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.description && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Description
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {data.description}
                </p>
              </div>
            )}
            {data.reason && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Reason
                </p>
                <p className="text-sm whitespace-pre-wrap">{data.reason}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
