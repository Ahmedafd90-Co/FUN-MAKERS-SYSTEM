'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
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
import { AbsorptionExceptionAlert } from '@/components/procurement/absorption-exception-alert';
import { BudgetImpactCard } from '@/components/procurement/budget-impact-card';
import { WorkflowStatusCard } from '@/components/workflow/workflow-status-card';
import { WorkflowStatusHint } from '@/components/workflow/workflow-status-hint';
import {
  Field,
  SummaryItem,
  SummaryStrip,
  formatMoney,
} from '@/components/shared/detail-primitives';

export default function CreditNoteDetailPage() {
  const params = useParams<{ id: string; cnId: string }>();
  const utils = trpc.useUtils();

  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();

  const { data, isLoading, error } = trpc.procurement.creditNote.get.useQuery({
    projectId: params.id,
    id: params.cnId,
  });

  const transitionMut = trpc.procurement.creditNote.transition.useMutation({
    onSuccess: () => {
      utils.procurement.creditNote.get.invalidate();
      utils.workflow.instances.getByRecord.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? 'Transition failed');
    },
  });

  // Workflow instance drives approve/return/reject when present — these
  // actions are hidden from the transition bar and handled by the workflow.
  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'credit_note', recordId: params.cnId },
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

  if (error) {
    if (error.data?.code === 'FORBIDDEN') {
      return (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to view this credit note.
          </p>
        </div>
      );
    }
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error.message ?? 'Credit note not found.'}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        Credit note not found.
      </div>
    );
  }

  const d = data as any;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/procurement/credit-notes`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Credit Notes
      </Link>

      {/* ── Record Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">
              {d.creditNoteNumber}
            </h1>
            <ProcurementStatusBadge status={d.status} />
          </div>
          {d.subtype && (
            <p className="text-sm text-muted-foreground capitalize">
              {d.subtype.replace(/_/g, ' ')}
            </p>
          )}
        </div>
        <ProcurementTransitionActions
          currentStatus={d.status}
          recordFamily="credit_note"
          userPermissions={userPermissions ?? []}
          isLoading={transitionMut.isPending}
          hasActiveWorkflow={hasActiveWorkflow}
          onTransition={async (action, comment) => {
            await transitionMut.mutateAsync({
              projectId: params.id,
              id: params.cnId,
              action,
              comment,
            });
          }}
        />
      </div>

      <WorkflowStatusHint
        recordStatus={d.status}
        hasActiveWorkflow={hasActiveWorkflow}
        recordLabel="Credit Note"
      />

      {/* ── Workflow (renders null when no instance exists) ── */}
      <WorkflowStatusCard recordType="credit_note" recordId={params.cnId} />

      {/* Separator only when there is an actual workflow block to divide from */}
      {hasActiveWorkflow && <Separator />}

      <AbsorptionExceptionAlert
        projectId={params.id}
        sourceRecordType="credit_note"
        sourceRecordId={params.cnId}
      />

      {/* ── Summary Strip — 4 facts additive to the Credit Note Details card below ── */}
      <SummaryStrip cols={4}>
        <SummaryItem
          label="Amount"
          value={
            <span className="font-mono tabular-nums">
              {formatMoney(d.amount)} {d.currency}
            </span>
          }
          emphasis
        />
        <SummaryItem
          label="Received Date"
          value={
            d.receivedDate ? (
              <span className="font-mono tabular-nums">
                {new Date(d.receivedDate).toLocaleDateString()}
              </span>
            ) : (
              <span className="text-muted-foreground/50 italic">Not set</span>
            )
          }
        />
        <SummaryItem
          label="Vendor"
          value={d.vendor?.name ?? 'Unknown Vendor'}
        />
        <SummaryItem
          label="Credit Against"
          value={
            d.supplierInvoice ? (
              <Link
                href={`/projects/${params.id}/procurement/supplier-invoices/${d.supplierInvoiceId}`}
                className="text-primary hover:underline"
              >
                {d.supplierInvoice.invoiceNumber ?? 'View Invoice'}
              </Link>
            ) : d.purchaseOrder ? (
              <Link
                href={`/projects/${params.id}/procurement/purchase-orders/${d.purchaseOrderId}`}
                className="text-primary hover:underline"
              >
                {d.purchaseOrder.poNumber ?? 'View PO'}
              </Link>
            ) : (
              <span className="text-muted-foreground/50 italic">Not linked</span>
            )
          }
        />
      </SummaryStrip>

      {/* Credit Note Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Credit Note Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Vendor" value={d.vendor?.name ?? '-'} />
          <Field label="Type" value={d.subtype?.replace(/_/g, ' ') ?? '-'} />
          <Field label="Currency" value={d.currency} />
          <Field
            label="Amount"
            value={`${formatMoney(d.amount)} ${d.currency}`}
          />
          <Field
            label="Received Date"
            value={
              d.receivedDate
                ? new Date(d.receivedDate).toLocaleDateString()
                : '-'
            }
          />
          <Field
            label="Created"
            value={new Date(d.createdAt).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      {/* Reason */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Reason</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{d.reason}</p>
        </CardContent>
      </Card>

      {/* Linked Records */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Linked Records</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Supplier Invoice"
            value={
              d.supplierInvoice ? (
                <Link
                  href={`/projects/${params.id}/procurement/supplier-invoices/${d.supplierInvoiceId}`}
                  className="text-primary hover:underline"
                >
                  {d.supplierInvoice.invoiceNumber ?? 'View Invoice'}
                </Link>
              ) : (
                '-'
              )
            }
          />
          <Field
            label="Purchase Order"
            value={
              d.purchaseOrder ? (
                <Link
                  href={`/projects/${params.id}/procurement/purchase-orders/${d.purchaseOrderId}`}
                  className="text-primary hover:underline"
                >
                  {d.purchaseOrder.poNumber ?? 'View PO'}
                </Link>
              ) : (
                '-'
              )
            }
          />
          <Field
            label="Correspondence"
            value={
              d.correspondence ? (
                <Link
                  href={`/projects/${params.id}/commercial/correspondence/${d.correspondenceId}`}
                  className="text-primary hover:underline"
                >
                  {d.correspondence.referenceNumber ??
                    d.correspondence.subject ??
                    'View Correspondence'}
                </Link>
              ) : (
                '-'
              )
            }
          />
        </CardContent>
      </Card>

      {/* Budget Impact — renders only if absorption succeeded (no open exception) */}
      {d.status === 'applied' || d.status === 'closed' ? (
        <BudgetImpactCard
          projectId={params.id}
          sourceRecordType="credit_note"
          sourceRecordId={params.cnId}
          amount={d.amount}
          currency={d.currency}
          recordLabel="credit note"
          variant="reversal"
        />
      ) : null}
    </div>
  );
}
