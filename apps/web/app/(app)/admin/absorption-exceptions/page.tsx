'use client';

/**
 * Admin > Absorption Exceptions — cross-project budget absorption failures.
 *
 * Same list+detail-sheet pattern as Posting Exceptions.
 */

import { useState } from 'react';

import { AbsorptionExceptionDetail } from '@/components/admin/absorption-exception-detail';
import { AbsorptionExceptionList } from '@/components/admin/absorption-exception-list';

export default function AbsorptionExceptionsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <AbsorptionExceptionList
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
