'use client';

import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { QuotationForm } from '@/components/procurement/quotation-form';

export default function CreateQuotationPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  // Optional pre-selection from ?rfqId=...
  const preselectedRfqId = searchParams.get('rfqId') ?? undefined;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/procurement/quotations`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Quotations
      </Link>

      <PageHeader
        title="Record Quotation"
        description="Record a vendor's quotation response for an issued RFQ."
      />

      <QuotationForm projectId={params.id} preselectedRfqId={preselectedRfqId} />
    </div>
  );
}
