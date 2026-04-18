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
import { WorkflowStatusCard } from '@/components/workflow/workflow-status-card';
import { WorkflowStatusHint } from '@/components/workflow/workflow-status-hint';
import {
  Field,
  SummaryItem,
  SummaryStrip,
  formatMoney,
} from '@/components/shared/detail-primitives';

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string; poId: string }>();
  const utils = trpc.useUtils();

  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();

  const { data, isLoading, error } = trpc.procurement.purchaseOrder.get.useQuery({
    projectId: params.id,
    id: params.poId,
  });

  const transitionMut = trpc.procurement.purchaseOrder.transition.useMutation({
    onSuccess: () => {
      utils.procurement.purchaseOrder.get.invalidate();
      utils.workflow.instances.getByRecord.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? 'Transition failed');
    },
  });

  // Workflow instance drives approve/return/reject when present — these
  // actions are hidden from the transition bar and handled by the workflow.
  const { data: workflowData } = trpc.workflow.instances.getByRecord.useQuery(
    { recordType: 'purchase_order', recordId: params.poId },
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
            You don&apos;t have permission to view this purchase order.
          </p>
        </div>
      );
    }
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error.message ?? 'Purchase order not found.'}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        Purchase order not found.
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
        href={`/projects/${params.id}/procurement/purchase-orders`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Purchase Orders
      </Link>

      {/* ── Record Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">
              {d.poNumber ?? 'Purchase Order'}
            </h1>
            <ProcurementStatusBadge status={data.status} />
          </div>
          {data.title && (
            <p className="text-sm text-muted-foreground">{data.title}</p>
          )}
        </div>
        <ProcurementTransitionActions
          currentStatus={data.status}
          recordFamily="purchase_order"
          userPermissions={userPermissions ?? []}
          isLoading={transitionMut.isPending}
          hasActiveWorkflow={hasActiveWorkflow}
          onTransition={async (action, comment) => {
            await transitionMut.mutateAsync({
              projectId: params.id,
              id: params.poId,
              action,
              comment,
            });
          }}
        />
      </div>

      <WorkflowStatusHint
        recordStatus={data.status}
        hasActiveWorkflow={hasActiveWorkflow}
        recordLabel="Purchase Order"
      />

      {/* ── Workflow (renders null when no instance exists) ── */}
      <WorkflowStatusCard recordType="purchase_order" recordId={params.poId} />

      {/* Separator only when there is an actual workflow block to divide from */}
      {hasActiveWorkflow && <Separator />}

      <AbsorptionExceptionAlert
        projectId={params.id}
        sourceRecordType="purchase_order"
        sourceRecordId={params.poId}
      />

      {/* ── Summary Strip — 4 facts additive to the PO Details card below ── */}
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
          label="Delivery Date"
          value={
            d.deliveryDate ? (
              <span className="font-mono tabular-nums">
                {new Date(d.deliveryDate).toLocaleDateString()}
              </span>
            ) : (
              <span className="text-muted-foreground/50 italic">Not set</span>
            )
          }
        />
        <SummaryItem
          label="Payment Terms"
          value={
            d.paymentTerms ?? (
              <span className="text-muted-foreground/50 italic">Not set</span>
            )
          }
        />
        <SummaryItem
          label="Vendor"
          value={d.vendor?.name ?? 'Unknown Vendor'}
        />
      </SummaryStrip>

      {/* PO Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Purchase Order Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Vendor" value={d.vendor?.name ?? '-'} />
          <Field label="Currency" value={data.currency} />
          <Field
            label="Total Amount"
            value={`${formatMoney(data.totalAmount)} ${data.currency}`}
          />
          <Field
            label="Delivery Date"
            value={
              d.deliveryDate
                ? new Date(d.deliveryDate).toLocaleDateString()
                : '-'
            }
          />
          <Field label="Payment Terms" value={d.paymentTerms ?? '-'} />
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
            label="RFQ"
            value={
              d.rfq ? (
                <Link
                  href={`/projects/${params.id}/procurement/rfq/${d.rfqId}`}
                  className="text-primary hover:underline"
                >
                  {d.rfq.referenceNumber ?? 'View RFQ'}
                </Link>
              ) : (
                '-'
              )
            }
          />
          <Field
            label="Quotation"
            value={
              d.quotation ? (
                <Link
                  href={`/projects/${params.id}/procurement/quotations/${d.quotationId}`}
                  className="text-primary hover:underline"
                >
                  {d.quotation.quotationRef ?? 'View Quotation'}
                </Link>
              ) : (
                '-'
              )
            }
          />
          <Field
            label="Budget Category"
            value={
              d.category?.name ??
              (d.categoryId ? 'Mapped' : 'Not mapped')
            }
          />
        </CardContent>
      </Card>

      {/* Description */}
      {d.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {d.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      {d.items?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Line Items ({d.items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-4">Description</th>
                    <th className="text-right py-2 px-4">Qty</th>
                    <th className="text-left py-2 px-4">Unit</th>
                    <th className="text-right py-2 px-4">Unit Price</th>
                    <th className="text-right py-2 pl-4">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((item: { id?: string; itemDescription: string; quantity: number; unit: string; unitPrice: number | string; totalPrice: number | string }, idx: number) => (
                    <tr key={item.id ?? idx} className="border-b last:border-0">
                      <td className="py-2 pr-4">{item.itemDescription}</td>
                      <td className="text-right py-2 px-4 tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="py-2 px-4">{item.unit}</td>
                      <td className="text-right py-2 px-4 tabular-nums">
                        {formatMoney(item.unitPrice)}
                      </td>
                      <td className="text-right py-2 pl-4 tabular-nums">
                        {formatMoney(item.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
