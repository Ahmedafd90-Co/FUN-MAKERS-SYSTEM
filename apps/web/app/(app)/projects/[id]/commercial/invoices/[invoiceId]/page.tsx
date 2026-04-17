'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarClock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { Button } from '@fmksa/ui/components/button';
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
import { InvoiceCollectionsSection } from '@/components/commercial/invoice-collections-section';
import { WorkflowStatusCard } from '@/components/workflow/workflow-status-card';
import { WorkflowStatusHint } from '@/components/workflow/workflow-status-hint';
import { formatMoney, formatRate, Field, SummaryItem, SummaryStrip } from '@/components/commercial/shared';
import { AttachmentsPanel } from '@/components/attachments/attachments-panel';
import { EvidenceDrawer } from '@/components/evidence/evidence-drawer';

function isDueSoon(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const now = new Date();
  const daysUntil = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysUntil >= 0 && daysUntil <= 7;
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export default function TaxInvoiceDetailPage() {
  const params = useParams<{ id: string; invoiceId: string }>();
  const utils = trpc.useUtils();
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const { data: me } = trpc.auth.me.useQuery();

  const { data, isLoading, error } = trpc.commercial.taxInvoice.get.useQuery({
    projectId: params.id,
    id: params.invoiceId,
  });

  const transitionMut = trpc.commercial.taxInvoice.transition.useMutation({
    onSuccess: () => {
      utils.commercial.taxInvoice.get.invalidate();
      utils.workflow.instances.getByRecord.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? 'Transition failed');
    },
  });

  // Workflow instance drives approve/return/reject when present.
  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'tax_invoice', recordId: params.invoiceId },
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
        {error?.message ?? 'Tax Invoice not found.'}
      </div>
    );
  }

  const dueDateStr = data.dueDate ? String(data.dueDate) : null;
  const dueSoon = isDueSoon(dueDateStr);
  const overdue = isOverdue(dueDateStr);
  const isCollected = data.status === 'collected';

  // IPC label — prefer referenceNumber, fall back to the IPC's IPA period
  // (e.g. "Period 2 IPC") so the link never reads "View IPC" in the UI.
  const ipcData = (data as any).ipc as
    | {
        referenceNumber: string | null;
        ipa?: { periodNumber: number } | null;
      }
    | null
    | undefined;
  const ipcRef: string | null = ipcData
    ? (ipcData.referenceNumber ??
      (ipcData.ipa ? `Period ${ipcData.ipa.periodNumber} IPC` : null))
    : null;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/commercial/invoices`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        ← Tax Invoices
      </Link>

      {/* ── Record Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">
              {data.invoiceNumber}
            </h1>
            <CommercialStatusBadge status={data.status} />
          </div>
          {data.referenceNumber && (
            <p className="text-sm text-muted-foreground font-mono">
              Ref: {data.referenceNumber}
            </p>
          )}
          {/* Due date urgency — single authoritative location */}
          {data.dueDate && (overdue || dueSoon) && (
            <div className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-amber-600" />
              {overdue ? (
                <Badge variant="destructive" className="text-[11px]">
                  Overdue — due {new Date(data.dueDate).toLocaleDateString()}
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="text-[11px] bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200"
                >
                  Due {new Date(data.dueDate).toLocaleDateString()}
                </Badge>
              )}
            </div>
          )}
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
            recordFamily="taxInvoice"
            permissions={me?.permissions ?? []}
            isLoading={transitionMut.isPending}
            hasActiveWorkflow={hasActiveWorkflow}
            onTransition={async (action, comment) => {
              await transitionMut.mutateAsync({
                projectId: params.id,
                id: params.invoiceId,
                action,
                comment,
              });
            }}
          />
        </div>
      </div>

      <WorkflowStatusHint
        recordStatus={data.status}
        hasActiveWorkflow={hasActiveWorkflow}
        recordLabel="Tax Invoice"
      />

      {/* ── Workflow (renders null when no instance exists) ── */}
      <WorkflowStatusCard recordType="tax_invoice" recordId={params.invoiceId} />

      {/* ── Attachments (WS1 Phase C) ── */}
      <AttachmentsPanel
        projectId={params.id}
        recordType="tax_invoice"
        recordId={params.invoiceId}
      />

      {/* ── Summary Strip — financial context at a glance ── */}
      <SummaryStrip>
        <SummaryItem
          label="Total Amount"
          value={
            <span className="font-mono tabular-nums">
              {formatMoney(data.totalAmount)} {data.currency}
            </span>
          }
          emphasis
        />
        <SummaryItem
          label="Gross Amount"
          value={
            <span className="font-mono tabular-nums">
              {formatMoney(data.grossAmount)} {data.currency}
            </span>
          }
        />
        <SummaryItem
          label="VAT"
          value={
            <span className="font-mono tabular-nums">
              {formatMoney(data.vatAmount)} {data.currency}
              <span className="text-muted-foreground text-[10px] ml-1">
                ({formatRate(data.vatRate)})
              </span>
            </span>
          }
        />
        <SummaryItem label="Status" value={<CommercialStatusBadge status={data.status} />} />
        <SummaryItem
          label="Due Date"
          value={
            data.dueDate ? (
              <span className={`font-mono tabular-nums ${overdue ? 'text-destructive font-semibold' : dueSoon ? 'text-amber-700 font-medium' : ''}`}>
                {new Date(data.dueDate).toLocaleDateString()}
              </span>
            ) : (
              <span className="text-muted-foreground/50 italic">Not set</span>
            )
          }
          destructive={overdue}
        />
        <SummaryItem
          label="Certified from IPC"
          value={
            <Link
              href={`/projects/${params.id}/commercial/ipc/${data.ipcId}`}
              className="text-primary hover:underline text-xs"
            >
              {ipcRef ?? 'View IPC'}
            </Link>
          }
        />
      </SummaryStrip>

      {/* ── Invoice Details ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Invoice Date"
            value={
              <span className="font-mono tabular-nums">
                {new Date(data.invoiceDate).toLocaleDateString()}
              </span>
            }
          />
          {data.dueDate && (
            <Field
              label="Due Date"
              value={
                <span className={`font-mono tabular-nums ${overdue ? 'text-destructive font-medium' : ''}`}>
                  {new Date(data.dueDate).toLocaleDateString()}
                </span>
              }
            />
          )}
          <Field label="Currency" value={data.currency} />
          <Field
            label="Gross Amount"
            value={
              <span className="font-mono tabular-nums">
                {formatMoney(data.grossAmount)} {data.currency}
              </span>
            }
          />
          <Field
            label="VAT Rate"
            value={
              <span className="font-mono tabular-nums">
                {formatRate(data.vatRate)}
              </span>
            }
          />
          <Field
            label="VAT Amount"
            value={
              <span className="font-mono tabular-nums">
                {formatMoney(data.vatAmount)} {data.currency}
              </span>
            }
          />
          <Field
            label="Total Amount"
            value={
              <span className="font-semibold font-mono tabular-nums">
                {formatMoney(data.totalAmount)} {data.currency}
              </span>
            }
          />
        </CardContent>
      </Card>

      {/* ── Buyer / Seller ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Parties</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Buyer
            </p>
            <Field label="Name" value={data.buyerName} />
            {data.buyerTaxId && (
              <Field label="Tax ID" value={<span className="font-mono">{data.buyerTaxId}</span>} />
            )}
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Seller
            </p>
            <Field label="Tax ID" value={<span className="font-mono">{data.sellerTaxId}</span>} />
          </div>
        </CardContent>
      </Card>

      {/* ── Source Records ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Source Records</CardTitle>
        </CardHeader>
        <CardContent>
          <Field
            label="CERTIFIED FROM IPC"
            value={
              <Link
                href={`/projects/${params.id}/commercial/ipc/${data.ipcId}`}
                className="text-primary hover:underline"
              >
                {ipcRef ?? 'View IPC'}
              </Link>
            }
          />
        </CardContent>
      </Card>

      {/* ── Collections ── */}
      <InvoiceCollectionsSection
        projectId={params.id}
        invoiceId={params.invoiceId}
        invoiceStatus={data.status}
        invoiceTotalAmount={String(data.totalAmount)}
        invoiceCurrency={data.currency}
        invoiceDueDate={dueDateStr}
        canRecord={me?.permissions?.includes('tax_invoice.edit') ?? false}
      />

      {/* ── Evidence drawer (WS1 Phase C) ── */}
      <EvidenceDrawer
        projectId={params.id}
        recordType="tax_invoice"
        recordId={params.invoiceId}
        recordLabel={data.referenceNumber ?? 'Tax Invoice'}
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
      />
    </div>
  );
}
