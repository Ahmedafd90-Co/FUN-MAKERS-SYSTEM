'use client';

/**
 * Admin > Posting Exceptions -- list and manage posting pipeline failures.
 * Task 1.7.8
 */

import { useState } from 'react';
import { Toaster } from 'sonner';

import { PostingExceptionDetail } from '@/components/admin/posting-exception-detail';
import { PostingExceptionList } from '@/components/admin/posting-exception-list';

export default function PostingExceptionsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <Toaster position="top-right" />
      <PostingExceptionList
        onSelectException={(id) => setSelectedId(id)}
      />
      <PostingExceptionDetail
        exceptionId={selectedId}
        open={!!selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </>
  );
}
