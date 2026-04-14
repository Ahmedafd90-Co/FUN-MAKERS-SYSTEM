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
      },
      onError: (err) => {
        toast.error(err.message ?? 'Transition failed');
      },
    });

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
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            {(data as any).invoiceNumber ?? 'Invoice'}
          </h1>
          <div className="flex items-center gap-2">
            <ProcurementStatusBadge status={data.status} />
            <span className="text-sm text-muted-foreground">
              {(data as any).vendor?.name ?? 'Unknown Vendor'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Manual approval — transitions are operator-driven, not workflow-routed.
          </p>
        </div>
        <ProcurementTransitionActions
          currentStatus={data.status}
          recordFamily="supplier_invoice"
          userPermissions={userPermissions ?? []}
          isLoading={transitionMut.isPending}
          hasActiveWorkflow={false}
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
          <Field label="Vendor" value={(data as any).vendor?.name ?? '-'} />
          <Field label="Currency" value={data.currency} />
          <Field
            label="Gross Amount"
            value={`${formatMoney((data as any).grossAmount)} ${data.currency}`}
          />
          <Field
            label="VAT Rate"
            value={
              (data as any).vatRate != null
                ? `${parseFloat(String((data as any).vatRate))}%`
                : '-'
            }
          />
          <Field
            label="VAT Amount"
            value={`${formatMoney((data as any).vatAmount)} ${data.currency}`}
          />
          <Field
            label="Total Amount"
            value={`${formatMoney(data.totalAmount)} ${data.currency}`}
          />
          <Field
            label="Invoice Date"
            value={
              (data as any).invoiceDate
                ? new Date((data as any).invoiceDate).toLocaleDateString()
                : '-'
            }
          />
          <Field
            label="Due Date"
            value={
              (data as any).dueDate
                ? new Date((data as any).dueDate).toLocaleDateString()
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
              (data as any).purchaseOrder ? (
                <Link
                  href={`/projects/${params.id}/procurement/purchase-orders/${(data as any).purchaseOrderId}`}
                  className="text-primary hover:underline"
                >
                  {(data as any).purchaseOrder.poNumber ?? 'View PO'}
                </Link>
              ) : (
                (data as any).noPOReason ?? 'None'
              )
            }
          />
          <Field
            label="Budget Category"
            value={(data as any).category?.name ?? ((data as any).categoryId ? 'Mapped' : 'Not mapped')}
          />
        </CardContent>
      </Card>

      {/* Budget Impact */}
      {data.status === 'approved' || data.status === 'paid' || data.status === 'closed' ? (
        <Card className="border-green-500/30">
          <CardHeader>
            <CardTitle className="text-sm">Budget Impact</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This invoice has been absorbed into the project budget as an{' '}
              <span className="font-medium text-foreground">actual cost</span>{' '}
              of{' '}
              <span className="font-medium tabular-nums">
                {formatMoney(data.totalAmount)} {data.currency}
              </span>
              .
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
