'use client';

/**
 * Document Viewer Page — Task 1.6.11
 *
 * Renders the full document viewer for a specific document within
 * a project workspace. Nested under the project layout.
 */

import { useParams } from 'next/navigation';

import { DocumentViewer } from '@/components/documents/document-viewer';

export default function DocumentViewerPage() {
  const params = useParams<{ id: string; docId: string }>();

  return (
    <DocumentViewer projectId={params.id} documentId={params.docId} />
  );
}
