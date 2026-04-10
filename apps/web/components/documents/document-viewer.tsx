'use client';

/**
 * Document Viewer — Task 1.6.11
 *
 * Header: title + category badge + status badge + download button.
 * Main area: PDF iframe preview or file info card.
 * Below: Version History panel + Signature Panel + Actions.
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Separator } from '@fmksa/ui/components/separator';
import {
  ArrowLeft,
  Download,
  FileText,
  FileUp,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Toaster } from 'sonner';

import { trpc } from '@/lib/trpc-client';

import { SignaturePanel } from './signature-panel';
import { UploadWidget } from './upload-widget';
import { VersionHistory } from './version-history';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: Record<string, string> = {
  shop_drawing: 'Shop Drawing',
  material_submittal: 'Material Submittal',
  test_certificate: 'Test Certificate',
  contract_attachment: 'Contract Attachment',
  vendor_document: 'Vendor Document',
  letter: 'Letter',
  drawing: 'Drawing',
  specification: 'Specification',
  general: 'General',
};

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  switch (status) {
    case 'draft':
      return (
        <Badge variant="secondary" className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          Draft
        </Badge>
      );
    case 'in_review':
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
          In Review
        </Badge>
      );
    case 'approved':
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">
          Approved
        </Badge>
      );
    case 'signed':
      return (
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
          Signed
        </Badge>
      );
    case 'superseded':
      return (
        <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">
          Superseded
        </Badge>
      );
    case 'archived':
      return (
        <Badge variant="secondary" className="bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          Archived
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function categoryBadge(category: string) {
  return (
    <Badge variant="outline" className="font-normal">
      {CATEGORIES[category] ?? category}
    </Badge>
  );
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type DocumentViewerProps = {
  projectId: string;
  documentId: string;
};

export function DocumentViewer({ projectId, documentId }: DocumentViewerProps) {
  const [supersedeOpen, setSupersedeOpen] = useState(false);

  const {
    data: doc,
    isLoading,
    error,
    refetch,
  } = trpc.documents.get.useQuery({
    projectId,
    documentId,
  });

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">Loading document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-destructive">{error.message}</p>
        <Link
          href={`/projects/${projectId}/documents`}
          className="text-sm text-muted-foreground hover:text-foreground mt-2 inline-block"
        >
          Back to Documents
        </Link>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">Document not found.</p>
      </div>
    );
  }

  const currentVersion = doc.currentVersion;
  const isPdf = currentVersion?.mimeType === 'application/pdf';

  return (
    <>
      <Toaster position="top-right" />

      {/* Back link */}
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Project
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{doc.title}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {categoryBadge(doc.category)}
            {statusBadge(doc.status)}
            {currentVersion && (
              <span className="text-xs text-muted-foreground font-mono">
                v{currentVersion.versionNo} --{' '}
                {formatFileSize(currentVersion.fileSize)}
              </span>
            )}
          </div>
        </div>

        {/* Download current version */}
        {doc.downloadUrl && (
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">
              <Download className="mr-1.5 h-4 w-4" />
              Download
            </a>
          </Button>
        )}
      </div>

      <Separator className="my-4" />

      {/* Main content area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Preview */}
        <div className="lg:col-span-2">
          {currentVersion ? (
            isPdf && doc.downloadUrl ? (
              <div className="rounded-lg border bg-muted/30 overflow-hidden">
                <iframe
                  src={doc.downloadUrl}
                  className="w-full h-[600px]"
                  title={`Preview: ${doc.title}`}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium">{doc.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {currentVersion.mimeType} --{' '}
                  {formatFileSize(currentVersion.fileSize)}
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  Preview is not available for this file type. Use the download
                  button above to view the file.
                </p>
              </div>
            )
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No file has been uploaded for this document yet.
              </p>
            </div>
          )}
        </div>

        {/* Right: Version history + Signature + Actions */}
        <div className="space-y-6">
          {/* Signature Panel */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- tRPC inferred type is compatible at runtime */}
          <SignaturePanel
            projectId={projectId}
            currentVersion={currentVersion as Parameters<typeof SignaturePanel>[0]['currentVersion']}
            onSignComplete={() => refetch()}
          />

          <Separator />

          {/* Version History */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- tRPC inferred type is compatible at runtime */}
          <VersionHistory
            projectId={projectId}
            versions={(doc.versions ?? []) as Parameters<typeof VersionHistory>[0]['versions']}
            currentVersionId={doc.currentVersionId}
          />

          <Separator />

          {/* Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight">Actions</h3>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setSupersedeOpen(true)}
            >
              <FileUp className="mr-1.5 h-4 w-4" />
              Upload New Version (Supersede)
            </Button>
          </div>
        </div>
      </div>

      {/* Supersede upload dialog */}
      <UploadWidget
        projectId={projectId}
        open={supersedeOpen}
        onOpenChange={setSupersedeOpen}
        mode="supersede"
        documentId={documentId}
      />
    </>
  );
}
