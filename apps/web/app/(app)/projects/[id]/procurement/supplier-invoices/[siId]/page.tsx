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
  formatRate,
} from '@/components/shared/detail-primitives';

export default function SupplierInvoiceDetailPage() {
  const params = useParams<{ id: string; siId: string }>();
  const utils = trpc.useUtils();

  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();

  const { data, isLoading, error } =
    trpc.procurement.supplierInvoice.get.useQuery({
      projectId: params.id,
      id: params.siId,
    });

  const transitionMut =
    trpc.procurement.supplierInvoice.transition.useMutation({
      onSuccess: () => {
        utils.procurement.supplierInvoice.get.invalidate();
        utils.workflow.instances.getByRecord.invalidate();
      },
      onError: (err) => {
        toast.error(err.message ?? 'Transition failed');
      },
    });

  // Workflow instance drives approve/return/reject when present — these
  // actions are hidden from the transition bar and handled by the workflow.
  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'supplier_invoice', recordId: params.siId },
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
            You don&apos;t have permission to view this invoice.
          </p>
        </div>
      );
    }
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error.message ?? 'Supplier invoice not found.'}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        Supplier invoice not found.
      </div>
    );
  }

  // Narrow-field untyped access — tRPC return type has loose fields that the
  // schema author hasn't fully typed yet. Collapse all casts into one alias
  // (matches the CN / Expense pattern) to keep lint output tight.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/procurement/supplier-invoices`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Supplier Invoices
      </Link>

      {/* ── Record Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">
              {d.invoiceNumber ?? 'Supplier Invoice'}
            </h1>
            <ProcurementStatusBadge status={data.status} />
          </div>
        </div>
        <ProcurementTransitionActions
          currentStatus={data.status}
          recordFamily="supplier_invoice"
          userPermissions={userPermissions ?? []}
          isLoading={transitionMut.isPending}
          hasActiveWorkflow={hasActiveWorkflow}
          onTransition={async (action, comment) => {
            await transitionMut.mutateAsync({
              projectId: params.id,
              id: params.siId,
              action,
              comment,
            });
          }}
        />
      </div>

      <WorkflowStatusHint
        recordStatus={data.status}
        hasActiveWorkflow={hasActiveWorkflow}
        recordLabel="Supplier Invoice"
      />

      {/* ── Workflow (renders null when no instance exists) ── */}
      <WorkflowStatusCard recordType="supplier_invoice" recordId={params.siId} />

      {/* Separator only when there is an actual workflow block to divide from */}
      {hasActiveWorkflow && <Separator />}

      <AbsorptionExceptionAlert
        projectId={params.id}
        sourceRecordType="supplier_invoice"
        sourceRecordId={params.siId}
      />

      {/* ── Summary Strip — 4 facts that are additive to the Invoice Details card below ── */}
      <SummaryStrip cols={4}>
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
          label="VAT"
          value={
            <span className="font-mono tabular-nums">
              {formatMoney(d.vatAmount)} {data.currency}
              {d.vatRate != null && (
                <span className="text-muted-foreground text-[10px] ml-1">
                  ({formatRate(d.vatRate)})
                </span>
              )}
            </span>
          }
        />
        <SummaryItem
          label="Due Date"
          value={
            d.dueDate ? (
              <span className="font-mono tabular-nums">
                {new Date(d.dueDate).toLocaleDateString()}
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
      </SummaryStrip>

      {/* Invoice Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Vendor" value={d.vendor?.name ?? '-'} />
          <Field label="Currency" value={data.currency} />
          <Field
            label="Gross Amount"
            value={`${formatMoney(d.grossAmount)} ${data.currency}`}
          />
          <Field
            label="VAT Rate"
            value={
              d.vatRate != null
                ? formatRate(d.vatRate)
                : '-'
            }
          />
          <Field
            label="VAT Amount"
            value={`${formatMoney(d.vatAmount)} ${data.currency}`}
          />
          <Field
            label="Total Amount"
            value={`${formatMoney(data.totalAmount)} ${data.currency}`}
          />
          <Field
            label="Invoice Date"
            value={
              d.invoiceDate
                ? new Date(d.invoiceDate).toLocaleDateString()
                : '-'
            }
          />
          <Field
            label="Due Date"
            value={
              d.dueDate
                ? new Date(d.dueDate).toLocaleDateString()
                : '-'
            }
          />
          <Field
            label="Created"
            value={new Date(data.createdAt).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      {/* Linked Records */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Linked Records</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                d.noPOReason ?? 'None'
              )
            }
          />
          <Field
            label="Budget Category"
            value={d.category?.name ?? (d.categoryId ? 'Mapped' : 'Not mapped')}
          />
        </CardContent>
      </Card>

      {/* Budget Impact — renders only if absorption succeeded (no open exception) */}
      {data.status === 'approved' ||
      data.status === 'paid' ||
      data.status === 'closed' ? (
        <BudgetImpactCard
          projectId={params.id}
          sourceRecordType="supplier_invoice"
          sourceRecordId={params.siId}
          amount={data.totalAmount}
          currency={data.currency}
          recordLabel="invoice"
          variant="actual"
        />
      ) : null}
    </div>
  );
}
