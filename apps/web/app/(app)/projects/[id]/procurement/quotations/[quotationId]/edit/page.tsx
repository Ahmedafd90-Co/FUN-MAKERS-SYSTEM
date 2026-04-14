'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { QuotationForm } from '@/components/procurement/quotation-form';
import { trpc } from '@/lib/trpc-client';

/** Statuses that allow editing — must match core/procurement/quotation/validation.ts */
const EDITABLE_STATUSES = ['received'];

export default function EditQuotationPage() {
  const params = useParams<{ id: string; quotationId: string }>();

  const { data, isLoading, error } = trpc.procurement.quotation.get.useQuery({
    projectId: params.id,
    id: params.quotationId,
  });

  if (isLoading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error?.data?.code === 'FORBIDDEN') {
    return (
      <div className="py-16 text-center space-y-2">
        <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-medium">Access Denied</p>
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

  if (!EDITABLE_STATUSES.includes(data.status)) {
    return (
      <div className="space-y-4">
        <Link
          href={`/projects/${params.id}/procurement/quotations/${params.quotationId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Quotation
        </Link>
        <div className="py-10 text-center text-sm text-muted-foreground">
          This quotation cannot be edited in its current status ({data.status}).
          Only received quotations can be edited.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/procurement/quotations/${params.quotationId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Quotation
      </Link>

      <PageHeader
        title="Edit Quotation"
        description={`Editing quotation from ${data.vendor?.name ?? 'vendor'}`}
      />

      <QuotationForm
        projectId={params.id}
        existingQuotation={{
          id: data.id,
          rfqId: data.rfqId,
          vendorId: data.vendorId,
          currency: data.currency,
          totalAmount: Number(data.totalAmount),
          validUntil: data.validUntil,
          paymentTerms: data.paymentTerms,
          deliveryTerms: data.deliveryTerms,
          lineItems: (data.lineItems ?? []).map((li) => ({
            rfqItemId: li.rfqItemId,
            itemDescription: li.itemDescription,
            unit: li.unit,
            quantity: Number(li.quantity),
            unitPrice: Number(li.unitPrice),
            totalPrice: Number(li.totalPrice),
            notes: li.notes,
          })),
          vendor: data.vendor,
          rfq: data.rfq,
        }}
      />
    </div>
  );
}
