'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Award, Pencil, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@fmksa/ui/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { Separator } from '@fmksa/ui/components/separator';
import { trpc } from '@/lib/trpc-client';
import { ProcurementStatusBadge } from '@/components/procurement/procurement-status-badge';
import { ProcurementTransitionActions } from '@/components/procurement/procurement-transition-actions';
import { RfqItemsTable } from '@/components/procurement/rfq-items-table';
import { RfqVendorsList } from '@/components/procurement/rfq-vendors-list';
import { WorkflowStatusCard } from '@/components/workflow/workflow-status-card';
import { WorkflowStatusHint } from '@/components/workflow/workflow-status-hint';

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
      <div className="text-sm mt-0.5">{value ?? '-'}</div>
    </div>
  );
}

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

export default function RfqDetailPage() {
  const params = useParams<{ id: string; rfqId: string }>();
  const utils = trpc.useUtils();
  const [awardingQuotationId, setAwardingQuotationId] = useState<string | null>(null);

  // Real permissions — no fake tokens
  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();

  const { data, isLoading, error } = trpc.procurement.rfq.get.useQuery({
    projectId: params.id,
    id: params.rfqId,
  });

  const transitionMut = trpc.procurement.rfq.transition.useMutation({
    onSuccess: () => {
      setAwardingQuotationId(null);
      utils.procurement.rfq.get.invalidate();
      utils.workflow.instances.getByRecord.invalidate();
    },
    onError: (err) => {
      setAwardingQuotationId(null);
      toast.error(err.message ?? 'Transition failed');
    },
  });

  // Check if a workflow instance is actively controlling the approval phase
  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'rfq', recordId: params.rfqId },
    { refetchInterval: 30_000 },
  );
  const hasActiveWorkflow = workflowData != null && ['in_progress', 'returned'].includes(workflowData.status);

  if (isLoading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  // Distinguish permission denied from other errors
  if (error) {
    if (error.data?.code === 'FORBIDDEN') {
      return (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to view this RFQ.
          </p>
        </div>
      );
    }
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error.message ?? 'RFQ not found.'}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        RFQ not found.
      </div>
    );
  }

  const canEdit =
    ['draft', 'returned'].includes(data.status) &&
    (userPermissions ?? []).includes('rfq.edit');

  const canCompare =
    data.quotations && data.quotations.length > 0;

  // Shortlisted quotations available for award (only when RFQ is in evaluation)
  const shortlistedQuotations =
    data.status === 'evaluation'
      ? (data.quotations ?? []).filter((q: { status: string }) => q.status === 'shortlisted')
      : [];

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/procurement/rfq`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to RFQs
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            {data.referenceNumber ?? data.rfqNumber ?? 'Draft RFQ'}
          </h1>
          <div className="flex items-center gap-2">
            <ProcurementStatusBadge status={data.status} />
            {data.title && (
              <span className="text-sm text-muted-foreground">
                {data.title}
              </span>
            )}
          </div>
          <WorkflowStatusHint
            recordStatus={data.status}
            hasActiveWorkflow={hasActiveWorkflow}
            recordLabel="RFQ"
          />
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/projects/${params.id}/procurement/rfq/${params.rfqId}/edit`}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Link>
            </Button>
          )}
          {canCompare && (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/projects/${params.id}/procurement/rfq/${params.rfqId}/compare`}
              >
                <BarChart3 className="h-4 w-4 mr-1" />
                Compare Quotations
              </Link>
            </Button>
          )}
          <ProcurementTransitionActions
            currentStatus={data.status}
            recordFamily="rfq"
            userPermissions={userPermissions ?? []}
            isLoading={transitionMut.isPending}
            hasActiveWorkflow={hasActiveWorkflow}
            onTransition={async (action, comment) => {
              await transitionMut.mutateAsync({
                projectId: params.id,
                id: params.rfqId,
                action,
                comment,
              });
            }}
          />
        </div>
      </div>

      <Separator />

      {/* Award section — shown only when RFQ is in evaluation and has shortlisted quotations */}
      {shortlistedQuotations.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="h-4 w-4" />
              Award Decision
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Select one shortlisted quotation to award. This will award the winning vendor,
              reject all other quotations, and mark the RFQ as awarded.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {shortlistedQuotations.map((q: { id: string; vendorId: string; totalAmount: unknown; currency: string; vendor?: { name: string } }) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {(q as any).vendor?.name ?? 'Unknown Vendor'}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatMoney(q.totalAmount)} {q.currency}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={transitionMut.isPending}
                    onClick={() => {
                      setAwardingQuotationId(q.id);
                      transitionMut.mutate({
                        projectId: params.id,
                        id: params.rfqId,
                        action: 'award',
                        quotationId: q.id,
                      });
                    }}
                  >
                    {awardingQuotationId === q.id ? 'Awarding...' : 'Award'}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <WorkflowStatusCard recordType="rfq" recordId={params.rfqId} />

      {/* RFQ Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">RFQ Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Currency" value={data.currency} />
          <Field
            label="Estimated Budget"
            value={
              data.estimatedBudget != null
                ? `${formatMoney(data.estimatedBudget)} ${data.currency}`
                : '-'
            }
          />
          <Field
            label="Required By"
            value={
              data.requiredByDate
                ? new Date(data.requiredByDate).toLocaleDateString()
                : '-'
            }
          />
          <Field
            label="Created"
            value={new Date(data.createdAt).toLocaleDateString()}
          />
          <Field
            label="Quotations Received"
            value={data.quotations?.length ?? 0}
          />
        </CardContent>
      </Card>

      {/* Description */}
      {data.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{data.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Invited Vendors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Invited Vendors ({data.rfqVendors?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RfqVendorsList vendors={data.rfqVendors ?? []} />
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Line Items ({data.items?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RfqItemsTable items={data.items ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
