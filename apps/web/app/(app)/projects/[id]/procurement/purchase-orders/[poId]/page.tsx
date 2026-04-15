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

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/procurement/purchase-orders`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Purchase Orders
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h1 className="text-xl font-semibold">
            {(data as any).poNumber ?? 'Purchase Order'}
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
            recordLabel="Purchase Order"
          />
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

      <WorkflowStatusCard recordType="purchase_order" recordId={params.poId} />

      <Separator />

      <AbsorptionExceptionAlert
        projectId={params.id}
        sourceRecordType="purchase_order"
        sourceRecordId={params.poId}
      />

      {/* PO Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Purchase Order Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Vendor" value={(data as any).vendor?.name ?? '-'} />
          <Field label="Currency" value={data.currency} />
          <Field
            label="Total Amount"
            value={`${formatMoney(data.totalAmount)} ${data.currency}`}
          />
          <Field
            label="Delivery Date"
            value={
              (data as any).deliveryDate
                ? new Date((data as any).deliveryDate).toLocaleDateString()
                : '-'
            }
          />
          <Field label="Payment Terms" value={(data as any).paymentTerms ?? '-'} />
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
              (data as any).rfq ? (
                <Link
                  href={`/projects/${params.id}/procurement/rfq/${(data as any).rfqId}`}
                  className="text-primary hover:underline"
                >
                  {(data as any).rfq.referenceNumber ?? 'View RFQ'}
                </Link>
              ) : (
                '-'
              )
            }
          />
          <Field
            label="Quotation"
            value={
              (data as any).quotation ? (
                <Link
                  href={`/projects/${params.id}/procurement/quotations/${(data as any).quotationId}`}
                  className="text-primary hover:underline"
                >
                  {(data as any).quotation.quotationRef ?? 'View Quotation'}
                </Link>
              ) : (
                '-'
              )
            }
          />
          <Field
            label="Budget Category"
            value={
              (data as any).category?.name ??
              ((data as any).categoryId ? 'Mapped' : 'Not mapped')
            }
          />
        </CardContent>
      </Card>

      {/* Description */}
      {(data as any).description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {(data as any).description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      {(data as any).items?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Line Items ({(data as any).items.length})
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
                  {(data as any).items.map((item: any, idx: number) => (
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
