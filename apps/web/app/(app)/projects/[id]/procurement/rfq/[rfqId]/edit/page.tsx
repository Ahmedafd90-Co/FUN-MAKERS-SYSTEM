'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { RfqForm } from '@/components/procurement/rfq-form';
import { trpc } from '@/lib/trpc-client';

/** Statuses that allow editing — must match core/procurement/rfq/validation.ts */
const EDITABLE_STATUSES = ['draft', 'returned'];

export default function EditRfqPage() {
  const params = useParams<{ id: string; rfqId: string }>();

  const { data, isLoading, error } = trpc.procurement.rfq.get.useQuery({
    projectId: params.id,
    id: params.rfqId,
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
        {error?.message ?? 'RFQ not found.'}
      </div>
    );
  }

  if (!EDITABLE_STATUSES.includes(data.status)) {
    return (
      <div className="space-y-4">
        <Link
          href={`/projects/${params.id}/procurement/rfq/${params.rfqId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to RFQ
        </Link>
        <div className="py-10 text-center text-sm text-muted-foreground">
          This RFQ cannot be edited in its current status ({data.status}).
          Only draft and returned RFQs can be edited.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/procurement/rfq/${params.rfqId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to RFQ
      </Link>

      <PageHeader
        title="Edit RFQ"
        description={`Editing ${data.referenceNumber ?? data.rfqNumber ?? 'Draft RFQ'}`}
      />

      <RfqForm
        projectId={params.id}
        existingRfq={{
          id: data.id,
          title: data.title,
          description: data.description,
          categoryId: data.categoryId,
          currency: data.currency,
          requiredByDate: data.requiredByDate,
          estimatedBudget: data.estimatedBudget != null ? Number(data.estimatedBudget) : null,
          items: (data.items ?? []).map((i) => ({
            itemDescription: i.itemDescription,
            unit: i.unit,
            quantity: Number(i.quantity),
            estimatedUnitPrice: i.estimatedUnitPrice != null ? Number(i.estimatedUnitPrice) : null,
          })),
          rfqVendors: data.rfqVendors,
        }}
      />
    </div>
  );
}
