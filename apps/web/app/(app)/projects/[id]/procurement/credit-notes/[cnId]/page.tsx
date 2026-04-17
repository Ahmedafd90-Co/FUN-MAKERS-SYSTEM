'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
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
import { AbsorptionExceptionAlert } from '@/components/procurement/absorption-exception-alert';
import { BudgetImpactCard } from '@/components/procurement/budget-impact-card';
import { WorkflowStatusCard } from '@/components/workflow/workflow-status-card';
import { WorkflowStatusHint } from '@/components/workflow/workflow-status-hint';
import { AttachmentsPanel } from '@/components/attachments/attachments-panel';
import { EvidenceDrawer } from '@/components/evidence/evidence-drawer';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
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

export default function CreditNoteDetailPage() {
  const params = useParams<{ id: string; cnId: string }>();
  const utils = trpc.useUtils();
  const [evidenceOpen, setEvidenceOpen] = useState(false);

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
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/procurement/credit-notes`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Credit Notes
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h1 className="text-xl font-semibold">{d.creditNoteNumber}</h1>
          <div className="flex items-center gap-2">
            <ProcurementStatusBadge status={d.status} />
            <span className="text-sm text-muted-foreground capitalize">
              {d.subtype?.replace(/_/g, ' ') ?? ''}
            </span>
          </div>
          <WorkflowStatusHint
            recordStatus={d.status}
            hasActiveWorkflow={hasActiveWorkflow}
            recordLabel="Credit Note"
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
      </div>

      <WorkflowStatusCard recordType="credit_note" recordId={params.cnId} />

      {/* ── Attachments (WS1 Phase E) ── */}
      <AttachmentsPanel
        projectId={params.id}
        recordType="credit_note"
        recordId={params.cnId}
      />

      <Separator />

      <AbsorptionExceptionAlert
        projectId={params.id}
        sourceRecordType="credit_note"
        sourceRecordId={params.cnId}
      />

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

      {/* ── Evidence drawer (WS1 Phase E) ── */}
      <EvidenceDrawer
        projectId={params.id}
        recordType="credit_note"
        recordId={params.cnId}
        recordLabel={
          (d as { creditNoteNumber?: string; referenceNumber?: string }).creditNoteNumber ??
          (d as { referenceNumber?: string }).referenceNumber ??
          'Credit Note'
        }
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
      />
    </div>
  );
}
