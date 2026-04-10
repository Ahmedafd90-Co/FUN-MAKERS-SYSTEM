'use client';

/**
 * Document Library Page — Task 1.6.10
 *
 * Renders the document list for a project. Nested under the project workspace
 * layout so project header and tabs persist. Opens the upload dialog on button
 * click.
 */

import { useParams } from 'next/navigation';
import { useState } from 'react';

import { DocumentList } from '@/components/documents/document-list';
import { UploadWidget } from '@/components/documents/upload-widget';

export default function DocumentLibraryPage() {
  const params = useParams<{ id: string }>();
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <>
      <DocumentList
        projectId={params.id}
        onUploadClick={() => setUploadOpen(true)}
      />
      <UploadWidget
        projectId={params.id}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
    </>
  );
}
