'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { RfqForm } from '@/components/procurement/rfq-form';

export default function CreateRfqPage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/procurement/rfq`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to RFQs
      </Link>

      <PageHeader
        title="Create RFQ"
        description="Draft a new Request for Quotation for this project."
      />

      <RfqForm projectId={params.id} />
    </div>
  );
}
