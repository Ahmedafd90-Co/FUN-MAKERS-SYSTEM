'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { Badge } from '@fmksa/ui/components/badge';
import { Separator } from '@fmksa/ui/components/separator';
import { trpc } from '@/lib/trpc-client';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { TransitionActions } from '@/components/commercial/transition-actions';

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

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="text-sm mt-0.5">{value ?? '-'}</p>
    </div>
  );
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
          {hasCost ? `${formatMoney(cost)} ${currency}` : '-'}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          {stage} — Time (days)
        </p>
        <p className="text-sm font-medium">
          {hasTime ? String(time) : '-'}
        </p>
      </div>
    </div>
  );
}

export default function VariationDetailPage() {
  const params = useParams<{ id: string; variationId: string }>();
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.commercial.variation.get.useQuery({
    projectId: params.id,
    id: params.variationId,
  });

  const transitionMut = trpc.commercial.variation.transition.useMutation({
    onSuccess: () => {
      utils.commercial.variation.get.invalidate();
    },
  });

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

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/commercial/variations`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Variations
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">
              {data.referenceNumber ?? 'Draft Variation'}
            </h1>
            <Badge variant="outline" className="capitalize">
              {data.subtype === 'change_order'
                ? 'Change Order'
                : data.subtype.toUpperCase()}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{data.title}</p>
          <CommercialStatusBadge status={data.status} />
        </div>
        <TransitionActions
          currentStatus={data.status}
          recordFamily="variation"
          permissions={['variation.transition']}
          isLoading={transitionMut.isPending}
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

      <Separator />

      {/* Three-stage tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cost &amp; Time Impact Tracking</CardTitle>
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

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Currency" value={data.currency} />
          <Field
            label="Initiated By"
            value={
              data.initiatedBy
                ? String(data.initiatedBy).replace(/_/g, ' ')
                : '-'
            }
          />
          <Field
            label="Contract Clause"
            value={data.contractClause ?? '-'}
          />
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

      {/* Description / Reason */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Description &amp; Reason</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.description && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Description
              </p>
              <p className="text-sm whitespace-pre-wrap">{data.description}</p>
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
          {!data.description && !data.reason && (
            <p className="text-sm text-muted-foreground">
              No description or reason provided.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
