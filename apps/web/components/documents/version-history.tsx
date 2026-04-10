'use client';

/**
 * Version History Panel — Task 1.6.11
 *
 * Ordered list of all document versions. Each shows version number,
 * upload date, file size, and status (current, signed, superseded).
 * Includes per-version download links via presigned URLs.
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Download } from 'lucide-react';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Version = {
  id: string;
  versionNo: number;
  fileKey: string;
  fileHash: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: Date | string;
  isSigned: boolean;
  signedAt: Date | string | null;
  signedBy: string | null;
  supersededAt: Date | string | null;
  supersededByVersionId: string | null;
  signatures: Array<{
    id: string;
    signerUserId: string;
    signatureType: string;
    signedAt: Date | string;
    hashAtSign: string;
  }>;
};

type VersionHistoryProps = {
  projectId: string;
  versions: Version[];
  currentVersionId: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VersionHistory({
  projectId,
  versions,
  currentVersionId,
}: VersionHistoryProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold tracking-tight">Version History</h3>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No versions uploaded yet.
        </p>
      ) : (
        <div className="space-y-2">
          {versions.map((version) => (
            <VersionRow
              key={version.id}
              projectId={projectId}
              version={version}
              isCurrent={version.id === currentVersionId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Version row
// ---------------------------------------------------------------------------

function VersionRow({
  projectId,
  version,
  isCurrent,
}: {
  projectId: string;
  version: Version;
  isCurrent: boolean;
}) {
  const downloadQuery = trpc.documents.getDownloadUrl.useQuery(
    { projectId, fileKey: version.fileKey },
    { enabled: false },
  );

  const handleDownload = async () => {
    const result = await downloadQuery.refetch();
    if (result.data?.url) {
      window.open(result.data.url, '_blank');
    }
  };

  const isSuperseded = version.supersededAt != null;
  const isSigned = version.isSigned;

  return (
    <div
      className={`
        flex items-start gap-3 rounded-lg border p-3
        ${isCurrent ? 'border-primary/30 bg-primary/5' : 'border-border'}
      `}
    >
      {/* Version number */}
      <div className="flex flex-col items-center min-w-[40px]">
        <span className="text-sm font-mono font-semibold">
          v{version.versionNo}
        </span>
        {isCurrent && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1 py-0 mt-1 bg-primary/10 text-primary"
          >
            Current
          </Badge>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {formatDate(version.uploadedAt)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatFileSize(version.fileSize)}
          </span>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {isSigned && (
            <Badge
              variant="secondary"
              className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
            >
              Signed {version.signedAt ? formatDate(version.signedAt) : ''}
            </Badge>
          )}
          {isSuperseded && (
            <Badge
              variant="secondary"
              className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200"
            >
              Superseded
            </Badge>
          )}
        </div>

        {/* Signature details */}
        {version.signatures.length > 0 && (
          <div className="text-[11px] text-muted-foreground mt-1">
            {version.signatures.map((sig) => (
              <div key={sig.id}>
                Signed by {sig.signerUserId.slice(0, 8)}... on{' '}
                {formatDate(sig.signedAt)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Download button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0"
        onClick={handleDownload}
        title="Download this version"
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}
