'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { toast } from 'sonner';
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
import { QuotationLineItems } from '@/components/procurement/quotation-line-items';

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

export default function QuotationDetailPage() {
  const params = useParams<{ id: string; quotationId: string }>();
  const utils = trpc.useUtils();

  // Real permissions — no fake tokens
  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();

  const { data, isLoading, error } =
    trpc.procurement.quotation.get.useQuery({
      projectId: params.id,
      id: params.quotationId,
    });

  const transitionMut =
    trpc.procurement.quotation.transition.useMutation({
      onSuccess: () => {
        utils.procurement.quotation.get.invalidate();
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

  if (error || !data) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error?.message ?? 'Quotation not found.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/procurement/quotations`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Quotations
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            {data.vendor?.name ?? 'Quotation'}
          </h1>
          <div className="flex items-center gap-2">
            <ProcurementStatusBadge status={data.status} />
            {data.rfq && (
              <Link
                href={`/projects/${params.id}/procurement/rfq/${data.rfq.id}`}
                className="text-sm text-muted-foreground hover:underline"
              >
                RFQ: {data.rfq.referenceNumber ?? data.rfq.rfqNumber}
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data.status === 'received' &&
            (userPermissions ?? []).includes('quotation.edit') && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/projects/${params.id}/procurement/quotations/${params.quotationId}/edit`}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Link>
              </Button>
            )}
          <ProcurementTransitionActions
            currentStatus={data.status}
            recordFamily="quotation"
            userPermissions={userPermissions ?? []}
            isLoading={transitionMut.isPending}
            onTransition={async (action, comment) => {
              await transitionMut.mutateAsync({
                projectId: params.id,
                id: params.quotationId,
                action,
                comment,
              });
            }}
          />
        </div>
      </div>

      <Separator />

      {/* Quotation Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quotation Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Vendor"
            value={data.vendor?.name ?? '-'}
          />
          <Field
            label="Total Amount"
            value={
              <span className="font-semibold">
                {formatMoney(data.totalAmount)} {data.currency}
              </span>
            }
          />
          <Field label="Currency" value={data.currency} />
          <Field
            label="Received"
            value={new Date(data.receivedDate).toLocaleDateString()}
          />
          <Field
            label="Valid Until"
            value={
              data.validUntil
                ? new Date(data.validUntil).toLocaleDateString()
                : '-'
            }
          />
          <Field label="Payment Terms" value={data.paymentTerms} />
          <Field label="Delivery Terms" value={data.deliveryTerms} />
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Line Items ({data.lineItems?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QuotationLineItems
            items={data.lineItems ?? []}
            currency={data.currency}
          />
        </CardContent>
      </Card>
    </div>
  );
}
