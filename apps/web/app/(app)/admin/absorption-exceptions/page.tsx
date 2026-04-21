'use client';

/**
 * Admin > Absorption Exceptions — cross-project budget absorption failures.
 *
 * Same list+detail-sheet pattern as Posting Exceptions.
 *
 * URL params (Path β, 2026-04-21) — used by the Budget-page banner CTA:
 *   ?exception=<uuid>  — auto-open the detail sheet for that exception on load
 *   ?project=<uuid>    — pre-filter the list to a single project
 *   ?status=open|resolved|all — pre-select the status filter
 */

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AbsorptionExceptionDetail } from '@/components/admin/absorption-exception-detail';
import { AbsorptionExceptionList } from '@/components/admin/absorption-exception-list';

export default function AbsorptionExceptionsPage() {
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get('project');
  const exceptionIdParam = searchParams.get('exception');
  const statusParam = searchParams.get('status');

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Hydrate the detail sheet from the URL once on mount — after that the
  // local selection is authoritative so navigating within the list doesn't
  // fight with the query string. Revisiting the page with a new `?exception=`
  // rehydrates because searchParams changes identity.
  useEffect(() => {
    if (exceptionIdParam) setSelectedId(exceptionIdParam);
  }, [exceptionIdParam]);

  return (
    <>
      <AbsorptionExceptionList
        initialProjectId={projectIdParam ?? undefined}
        initialStatus={
          statusParam === 'open' || statusParam === 'resolved' || statusParam === 'all'
            ? statusParam
            : undefined
        }
        onSelectException={(id) => setSelectedId(id)}
      />
      <AbsorptionExceptionDetail
        exceptionId={selectedId}
        open={!!selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </>
  );
}
