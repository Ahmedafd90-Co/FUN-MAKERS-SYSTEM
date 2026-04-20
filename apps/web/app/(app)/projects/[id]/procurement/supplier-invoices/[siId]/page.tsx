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

/**
 * Decimal rate (0.0–1.0) → "15.00%" percent string.
 *
 * The schema stores `vatRate` as `Decimal(5,4)` in the 0–1 range (0.15 = 15%),
 * so UI must multiply by 100 before display — `parseFloat` alone would
 * incorrectly render "0.15%" for a 15% tax.
 */
function formatRate(val: unknown): string {
  const num =
    typeof val === 'string'
      ? parseFloat(val)
      : typeof val === 'number'
        ? val
        : 0;
  if (!Number.isFinite(num)) return '—';
  return `${(num * 100).toFixed(2)}%`;
}

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

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/procurement/supplier-invoices`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Supplier Invoices
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h1 className="text-xl font-semibold">
            {data.invoiceNumber ?? 'Supplier Invoice'}
          </h1>
          <div className="flex items-center gap-2">
            <ProcurementStatusBadge status={data.status} />
            <span className="text-sm text-muted-foreground">
              {data.vendor?.name ?? 'Unknown Vendor'}
            </span>
          </div>
          <WorkflowStatusHint
            recordStatus={data.status}
            hasActiveWorkflow={hasActiveWorkflow}
            recordLabel="Supplier Invoice"
          />
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

      <WorkflowStatusCard recordType="supplier_invoice" recordId={params.siId} />

      <Separator />

      <AbsorptionExceptionAlert
        projectId={params.id}
        sourceRecordType="supplier_invoice"
        sourceRecordId={params.siId}
      />

      {/* Invoice Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Vendor" value={data.vendor?.name ?? '-'} />
          <Field label="Currency" value={data.currency} />
          <Field
            label="Gross Amount"
            value={`${formatMoney(data.grossAmount)} ${data.currency}`}
          />
          <Field
            label="VAT Rate"
            value={
              data.vatRate != null
                ? formatRate(data.vatRate)
                : '-'
            }
          />
          <Field
            label="VAT Amount"
            value={`${formatMoney(data.vatAmount)} ${data.currency}`}
          />
          <Field
            label="Total Amount"
            value={`${formatMoney(data.totalAmount)} ${data.currency}`}
          />
          <Field
            label="Invoice Date"
            value={
              data.invoiceDate
                ? new Date(data.invoiceDate).toLocaleDateString()
                : '-'
            }
          />
          <Field
            label="Due Date"
            value={
              data.dueDate
                ? new Date(data.dueDate).toLocaleDateString()
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
              data.purchaseOrder ? (
                <Link
                  href={`/projects/${params.id}/procurement/purchase-orders/${data.purchaseOrderId}`}
                  className="text-primary hover:underline"
                >
                  {data.purchaseOrder.poNumber ?? 'View PO'}
                </Link>
              ) : (
                data.noPOReason ?? 'None'
              )
            }
          />
          <Field
            label="Budget Category"
            value={data.category?.name ?? (data.categoryId ? 'Mapped' : 'Not mapped')}
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
