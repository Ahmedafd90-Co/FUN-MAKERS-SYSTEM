'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { CreditNoteForm } from '@/components/procurement/credit-note-form';

export default function CreateCreditNotePage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${params.id}/procurement/credit-notes`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Credit Notes
      </Link>

      <PageHeader
        title="Record Credit Note"
        description="Log a credit note, rebate, or recovery from a vendor."
      />

      <CreditNoteForm projectId={params.id} />
    </div>
  );
}
