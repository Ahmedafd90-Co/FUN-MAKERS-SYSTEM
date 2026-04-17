'use client';

/**
 * AttachmentsPanel — WS1 / Phase A
 *
 * Shared read panel that lists documents attached to a single business
 * record via the existing polymorphic `Document.recordType` / `recordId`
 * columns. Opens the existing shadcn UploadWidget with the record link
 * pre-filled when the user wants to attach a new document.
 *
 * Deliberately minimal for the IPA pilot: no custom category rules, no
 * required-attachment enforcement, no supersede flow. Those belong to
 * later phases. This phase exists so the proof document lives on the
 * record page, not on a separate /documents screen.
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';
import { FileCheck2, Paperclip, Upload } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { UploadWidget } from '@/components/documents/upload-widget';
import { EmptyState } from '@/components/ui/empty-state';
import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Helpers — match existing shadcn document-list category labels
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
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

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type AttachmentsPanelProps = {
  projectId: string;
  recordType: string;
  recordId: string;
  /**
   * Display title for the panel heading (e.g. "Attachments", "Evidence files").
   * Kept as a prop so later record types can label the same panel consistently.
   */
  title?: string;
};

export function AttachmentsPanel({
  projectId,
  recordType,
  recordId,
  title = 'Attachments',
}: AttachmentsPanelProps) {
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data, isLoading, error } = trpc.documents.list.useQuery({
    projectId,
    recordType,
    recordId,
    skip: 0,
    take: 50,
  });

  const items = data?.items ?? [];
  const signedCount = items.filter((d) => d.currentVersion?.isSigned).length;
  const total = data?.total ?? 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{title}</CardTitle>
            {total > 0 && (
              <span className="text-xs text-muted-foreground">
                {total} file{total === 1 ? '' : 's'}
                {signedCount > 0 && (
                  <span className="ml-1">
                    · <span className="text-foreground/70">{signedCount} signed</span>
                  </span>
                )}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Attach document
          </Button>
        </CardHeader>

        <CardContent>
          {isLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Loading attachments...
            </p>
          )}

          {error && (
            <p className="py-6 text-center text-sm text-destructive">
              {error.message}
            </p>
          )}

          {!isLoading && !error && items.length === 0 && (
            <EmptyState
              icon={Paperclip}
              title="No attachments yet"
              description="Upload the supporting documents that belong to this record — measurement sheets, photographs, calculation backup, or the signed form."
              action={{ label: 'Attach document', onClick: () => setUploadOpen(true) }}
            />
          )}

          {!isLoading && items.length > 0 && (
            <ul className="divide-y divide-border">
              {items.map((doc) => {
                const version = doc.currentVersion;
                return (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/projects/${projectId}/documents/${doc.id}`}
                          className="truncate text-sm font-medium text-foreground hover:underline"
                        >
                          {doc.title}
                        </Link>
                        {version?.isSigned && (
                          <FileCheck2 className="h-3.5 w-3.5 text-status-signed" aria-label="Signed" />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="subtle" className="font-normal">
                          {categoryLabel(doc.category)}
                        </Badge>
                        <span>
                          {version ? `v${version.versionNo}` : '—'}
                        </span>
                        <span>·</span>
                        <span>{formatFileSize(version?.fileSize)}</span>
                        <span>·</span>
                        <span>{formatDate(version?.uploadedAt ?? doc.createdAt)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <UploadWidget
        projectId={projectId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        recordType={recordType}
        recordId={recordId}
      />
    </>
  );
}
