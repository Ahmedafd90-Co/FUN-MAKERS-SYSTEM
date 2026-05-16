'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SupplierInvoiceForm } from '@/components/procurement/supplier-invoice-form';

export default function CreateSupplierInvoicePage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/procurement/supplier-invoices`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Supplier Invoices
      </Link>

      <PageHeader
        title="Record Supplier Invoice"
        description="Log an invoice received from a vendor. If the invoice matches an existing PO, link it — otherwise explain why there is no PO."
      />

      <SupplierInvoiceForm projectId={params.id} />
    </div>
  );
}
