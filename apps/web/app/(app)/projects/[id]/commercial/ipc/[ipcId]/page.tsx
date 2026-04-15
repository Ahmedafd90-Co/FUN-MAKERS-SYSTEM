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

export default function IpcDetailPage() {
  const params = useParams<{ id: string; ipcId: string }>();
  const utils = trpc.useUtils();

  const { data: me } = trpc.auth.me.useQuery();

  const { data, isLoading, error } = trpc.commercial.ipc.get.useQuery({
    projectId: params.id,
    id: params.ipcId,
  });

  const transitionMut = trpc.commercial.ipc.transition.useMutation({
    onSuccess: () => {
      utils.commercial.ipc.get.invalidate();
      utils.workflow.instances.getByRecord.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? 'Transition failed');
    },
  });

  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'ipc', recordId: params.ipcId },
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
        {error?.message ?? 'IPC not found.'}
      </div>
    );
  }

  const workflowLabel = workflowData
    ? workflowData.status === 'approved'
      ? 'Approved'
      : workflowData.status === 'rejected'
        ? 'Rejected'
        : workflowData.status === 'returned'
          ? 'Returned'
          : 'In Progress'
    : data.status === 'draft'
      ? 'Not started'
      : '—';

  // IPA label — prefer referenceNumber, fall back to period-based label so
  // the link never reads "Linked IPA" in the UI.
  const ipaData = (data as any).ipa as
    | { referenceNumber: string | null; periodNumber: number }
    | null
    | undefined;
  const ipaRef: string | null = ipaData
    ? (ipaData.referenceNumber ?? `Period ${ipaData.periodNumber}`)
    : null;

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href={`/projects/${params.id}/commercial/ipc`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to IPCs
      </Link>

      {/* ── Record Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">
              {data.referenceNumber ?? 'Draft IPC'}
            </h1>
            <CommercialStatusBadge status={data.status} />
          </div>
          {ipaRef && (
            <p className="text-sm text-muted-foreground">
              Certifying{' '}
              <Link
                href={`/projects/${params.id}/commercial/ipa/${data.ipaId}`}
                className="text-primary hover:underline font-medium"
              >
                {ipaRef}
              </Link>
            </p>
          )}
          <WorkflowStatusHint
            recordStatus={data.status}
            hasActiveWorkflow={hasActiveWorkflow}
            recordLabel="IPC"
          />
        </div>
        <TransitionActions
          currentStatus={data.status}
          recordFamily="ipc"
          permissions={me?.permissions ?? []}
          isLoading={transitionMut.isPending}
          hasActiveWorkflow={hasActiveWorkflow}
          onTransition={async (action, comment) => {
            await transitionMut.mutateAsync({
              projectId: params.id,
              id: params.ipcId,
              action,
              comment,
            });
          }}
        />
      </div>

      {/* ── Summary Strip ── */}
      <SummaryStrip>
        <SummaryItem
          label="Net Certified"
          value={`${formatMoney(data.netCertified)} ${data.currency}`}
          emphasis
        />
        <SummaryItem
          label="Certified Amount"
          value={`${formatMoney(data.certifiedAmount)} ${data.currency}`}
        />
        <SummaryItem
          label="Retention"
          value={`${formatMoney(data.retentionAmount)} ${data.currency}`}
        />
        <SummaryItem label="Status" value={<CommercialStatusBadge status={data.status} />} />
        <SummaryItem label="Workflow" value={workflowLabel} />
        <SummaryItem
          label="Certification Date"
          value={new Date(data.certificationDate).toLocaleDateString()}
        />
      </SummaryStrip>

      {/* ── Workflow ── */}
      <WorkflowStatusCard recordType="ipc" recordId={params.ipcId} />

      {/* ── Financial Detail ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Financial Detail</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Certified Amount"
            value={`${formatMoney(data.certifiedAmount)} ${data.currency}`}
          />
          <Field
            label="Retention Amount"
            value={`${formatMoney(data.retentionAmount)} ${data.currency}`}
          />
          {data.adjustments != null && (
            <Field
              label="Adjustments"
              value={`${formatMoney(data.adjustments)} ${data.currency}`}
            />
          )}
          <Field
            label="Net Certified"
            value={
              <span className="font-semibold">
                {formatMoney(data.netCertified)} {data.currency}
              </span>
            }
          />
        </CardContent>
      </Card>

      {/* ── Certification Details ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Certification Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Certification Date"
            value={new Date(data.certificationDate).toLocaleDateString()}
          />
          <Field
            label="Linked IPA"
            value={
              <Link
                href={`/projects/${params.id}/commercial/ipa/${data.ipaId}`}
                className="text-primary hover:underline"
              >
                {ipaRef ?? 'View IPA'}
              </Link>
            }
          />
          <Field label="Currency" value={data.currency} />
          <Field
            label="Created"
            value={new Date(data.createdAt).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      {/* ── Remarks ── */}
      {data.remarks && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Remarks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{data.remarks}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
