'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PurchaseOrderForm } from '@/components/procurement/purchase-order-form';

export default function CreatePurchaseOrderPage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/procurement/purchase-orders`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Purchase Orders
      </Link>

      <PageHeader
        title="Create Purchase Order"
        description="Issue a direct purchase order to a vendor. For POs based on a quotation, use the quotation's detail page."
      />

      <PurchaseOrderForm projectId={params.id} />
    </div>
  );
}
