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

export default function CostProposalDetailPage() {
  const params = useParams<{ id: string; costProposalId: string }>();
  const utils = trpc.useUtils();

  const { data, isLoading, error } =
    trpc.commercial.costProposal.get.useQuery({
      projectId: params.id,
      id: params.costProposalId,
    });

  const transitionMut = trpc.commercial.costProposal.transition.useMutation({
    onSuccess: () => {
      utils.commercial.costProposal.get.invalidate();
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
        {error?.message ?? 'Cost Proposal not found.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/commercial/cost-proposals`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Cost Proposals
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            {data.referenceNumber ?? 'Draft Cost Proposal'}
          </h1>
          {data.revisionNumber != null && (
            <p className="text-sm text-muted-foreground">
              Revision {data.revisionNumber}
            </p>
          )}
          <CommercialStatusBadge status={data.status} />
        </div>
        <TransitionActions
          currentStatus={data.status}
          recordFamily="costProposal"
          permissions={['costProposal.transition']}
          isLoading={transitionMut.isPending}
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

      <Separator />

      {/* Three-stage cost/time tracking */}
      <Card>
        <CardHeader>
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

      {/* Details */}
      <Card>
        <CardHeader>
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
                  View Variation
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

      {/* Methodology */}
      {data.methodology && (
        <Card>
          <CardHeader>
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
