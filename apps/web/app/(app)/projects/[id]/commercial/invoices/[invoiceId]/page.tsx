'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { Separator } from '@fmksa/ui/components/separator';
import { trpc } from '@/lib/trpc-client';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { TransitionActions } from '@/components/commercial/transition-actions';

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

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="text-sm mt-0.5">{value ?? '-'}</p>
    </div>
  );
}

export default function TaxInvoiceDetailPage() {
  const params = useParams<{ id: string; invoiceId: string }>();
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.commercial.taxInvoice.get.useQuery({
    projectId: params.id,
    id: params.invoiceId,
  });

  const transitionMut = trpc.commercial.taxInvoice.transition.useMutation({
    onSuccess: () => {
      utils.commercial.taxInvoice.get.invalidate();
    },
  });

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

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/commercial/invoices`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Invoices
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{data.invoiceNumber}</h1>
          {data.referenceNumber && (
            <p className="text-sm text-muted-foreground">
              Ref: {data.referenceNumber}
            </p>
          )}
          <CommercialStatusBadge status={data.status} />
        </div>
        <TransitionActions
          currentStatus={data.status}
          recordFamily="taxInvoice"
          permissions={['taxInvoice.transition']}
          isLoading={transitionMut.isPending}
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

      <Separator />

      {/* Invoice Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Invoice Date"
            value={new Date(data.invoiceDate).toLocaleDateString()}
          />
          {data.dueDate && (
            <Field
              label="Due Date"
              value={new Date(data.dueDate).toLocaleDateString()}
            />
          )}
          <Field label="Currency" value={data.currency} />
          <Field
            label="Gross Amount"
            value={`${formatMoney(data.grossAmount)} ${data.currency}`}
          />
          <Field
            label="VAT Rate"
            value={`${parseFloat(String(data.vatRate)).toFixed(2)}%`}
          />
          <Field
            label="VAT Amount"
            value={`${formatMoney(data.vatAmount)} ${data.currency}`}
          />
          <Field
            label="Total Amount"
            value={
              <span className="font-semibold">
                {formatMoney(data.totalAmount)} {data.currency}
              </span>
            }
          />
        </CardContent>
      </Card>

      {/* Buyer / Seller */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Parties</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Buyer
            </p>
            <Field label="Name" value={data.buyerName} />
            {data.buyerTaxId && (
              <Field label="Tax ID" value={data.buyerTaxId} />
            )}
          </div>
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Seller
            </p>
            <Field label="Tax ID" value={data.sellerTaxId} />
          </div>
        </CardContent>
      </Card>

      {/* Linked IPC */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Linked Records</CardTitle>
        </CardHeader>
        <CardContent>
          <Field
            label="Linked IPC"
            value={
              <Link
                href={`/projects/${params.id}/commercial/ipc/${data.ipcId}`}
                className="text-primary hover:underline"
              >
                View IPC
              </Link>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
