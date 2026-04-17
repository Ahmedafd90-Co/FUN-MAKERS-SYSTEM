'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { Button } from '@fmksa/ui/components/button';
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
import { formatMoney, formatRate, Field, SummaryItem, SummaryStrip } from '@/components/commercial/shared';
import { AttachmentsPanel } from '@/components/attachments/attachments-panel';
import { EvidenceDrawer } from '@/components/evidence/evidence-drawer';

export default function IpaDetailPage() {
  const params = useParams<{ id: string; ipaId: string }>();
  const utils = trpc.useUtils();
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const { data: me } = trpc.auth.me.useQuery();

  const { data, isLoading, error } = trpc.commercial.ipa.get.useQuery({
    projectId: params.id,
    id: params.ipaId,
  });

  const transitionMut = trpc.commercial.ipa.transition.useMutation({
    onSuccess: () => {
      utils.commercial.ipa.get.invalidate();
      utils.workflow.instances.getByRecord.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? 'Transition failed');
    },
  });

  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'ipa', recordId: params.ipaId },
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
        {error?.message ?? 'IPA not found.'}
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

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href={`/projects/${params.id}/commercial/ipa`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to IPAs
      </Link>

      {/* ── Imported-historical banner ── */}
      {data.origin === 'imported_historical' && (
        <div className="flex items-start gap-3 rounded-md border border-blue-300 bg-blue-50 p-3 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200">
          <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-1 text-sm">
            <div className="font-medium">Imported historical IPA</div>
            <div className="text-xs">
              This record was imported from a historical sheet
              {data.importedAt && (
                <> on {new Date(data.importedAt).toLocaleDateString()}</>
              )}
              . Its ledger event uses <code className="font-mono">imported_historical</code>{' '}
              origin — so it is visible as historical truth but does not count
              alongside live activity in reconciliation.
            </div>
            {data.importBatchId && (
              <Link
                href={`/admin/imports/${data.importBatchId}`}
                className="inline-block text-xs underline"
              >
                View source batch →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Record Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">
              {data.referenceNumber ??
                (data.status === 'draft' ? 'Draft IPA' : 'IPA (no reference)')}
            </h1>
            <CommercialStatusBadge status={data.status} />
          </div>
          {data.periodNumber != null && (
            <p className="text-sm text-muted-foreground">
              Period {data.periodNumber} &middot;{' '}
              {new Date(data.periodFrom).toLocaleDateString()} &ndash;{' '}
              {new Date(data.periodTo).toLocaleDateString()}
            </p>
          )}
          <WorkflowStatusHint
            recordStatus={data.status}
            hasActiveWorkflow={hasActiveWorkflow}
            recordLabel="IPA"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEvidenceOpen(true)}
          >
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Evidence
          </Button>
          <TransitionActions
            currentStatus={data.status}
            recordFamily="ipa"
            permissions={me?.permissions ?? []}
            isLoading={transitionMut.isPending}
            hasActiveWorkflow={hasActiveWorkflow}
            onTransition={async (action, comment) => {
              await transitionMut.mutateAsync({
                projectId: params.id,
                id: params.ipaId,
                action,
                comment,
              });
            }}
          />
        </div>
      </div>

      {/* ── Summary Strip ── */}
      <SummaryStrip>
        <SummaryItem
          label="Net Claimed"
          value={`${formatMoney(data.netClaimed)} ${data.currency}`}
          emphasis
        />
        <SummaryItem
          label="Gross Amount"
          value={`${formatMoney(data.grossAmount)} ${data.currency}`}
        />
        <SummaryItem
          label="Retention"
          value={`${formatMoney(data.retentionAmount)} ${data.currency}`}
        />
        <SummaryItem label="Status" value={<CommercialStatusBadge status={data.status} />} />
        <SummaryItem label="Workflow" value={workflowLabel} />
        <SummaryItem
          label="Period"
          value={
            data.periodNumber != null
              ? `Period ${data.periodNumber}`
              : '—'
          }
        />
      </SummaryStrip>

      {/* ── Workflow ── */}
      <WorkflowStatusCard recordType="ipa" recordId={params.ipaId} />

      {/* ── Attachments (WS1 Phase A) ── */}
      <AttachmentsPanel
        projectId={params.id}
        recordType="ipa"
        recordId={params.ipaId}
      />

      {/* ── Financial Detail ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Financial Detail</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Gross Amount"
            value={`${formatMoney(data.grossAmount)} ${data.currency}`}
          />
          <Field
            label="Retention Amount"
            value={`${formatMoney(data.retentionAmount)} ${data.currency}`}
          />
          <Field
            label="Retention Rate"
            value={
              data.retentionRate != null ? formatRate(data.retentionRate) : '—'
            }
          />
          <Field
            label="Previous Certified"
            value={`${formatMoney(data.previousCertified)} ${data.currency}`}
          />
          <Field
            label="Current Claim"
            value={`${formatMoney(data.currentClaim)} ${data.currency}`}
          />
          <Field
            label="Net Claimed"
            value={
              <span className="font-semibold">
                {formatMoney(data.netClaimed)} {data.currency}
              </span>
            }
          />
          {data.advanceRecovery != null && (
            <Field
              label="Advance Recovery"
              value={`${formatMoney(data.advanceRecovery)} ${data.currency}`}
            />
          )}
          {data.otherDeductions != null && (
            <Field
              label="Other Deductions"
              value={`${formatMoney(data.otherDeductions)} ${data.currency}`}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Period Info ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Period Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Period Number"
            value={
              data.periodNumber != null ? `Period ${data.periodNumber}` : '—'
            }
          />
          <Field
            label="Period From"
            value={new Date(data.periodFrom).toLocaleDateString()}
          />
          <Field
            label="Period To"
            value={new Date(data.periodTo).toLocaleDateString()}
          />
          <Field label="Currency" value={data.currency} />
          <Field
            label="Created"
            value={new Date(data.createdAt).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      {/* ── Description ── */}
      {data.description && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{data.description}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Evidence drawer (WS1 Phase A) ── */}
      <EvidenceDrawer
        projectId={params.id}
        recordType="ipa"
        recordId={params.ipaId}
        recordLabel={
          data.referenceNumber ??
          (data.status === 'draft' ? 'Draft IPA' : 'IPA')
        }
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
      />
    </div>
  );
}
