'use client';

/**
 * Import batch list — admin-wide (cross-project) view of sheet-import batches.
 *
 * Clicking a row navigates to the batch detail / review-queue page. The
 * "Upload sheet" action opens the upload dialog; REST endpoint handles
 * the binary. Batches are ordered newest-first.
 */
import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { FileSpreadsheet, Upload } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { statusBadgeStyle } from '@/lib/badge-variants';
import { trpc } from '@/lib/trpc-client';

import { ImportUploadDialog } from './import-upload-dialog';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type ImportType = 'budget_baseline' | 'ipa_history';
type BatchStatus =
  | 'staged'
  | 'validated'
  | 'partially_valid'
  | 'committed'
  | 'rejected'
  | 'cancelled';

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  budget_baseline: 'Budget baseline',
  ipa_history: 'IPA history',
};

const STATUS_LABELS: Record<BatchStatus, string> = {
  staged: 'Staged',
  validated: 'Validated',
  partially_valid: 'Partially valid',
  committed: 'Committed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BatchStatusBadge({ status }: { status: BatchStatus }) {
  // Map server enums to the shared badge palette
  const mapped =
    status === 'committed'
      ? 'approved'
      : status === 'staged'
        ? 'pending'
        : status === 'validated'
          ? 'active'
          : status === 'partially_valid'
            ? 'in_progress'
            : status === 'rejected'
              ? 'rejected'
              : 'archived'; // cancelled
  const style = statusBadgeStyle(mapped);
  return (
    <Badge variant={style.variant} className={style.className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

type SummaryShape = {
  totalRows?: number;
  pending?: number;
  valid?: number;
  invalid?: number;
  conflict?: number;
  committed?: number;
  skipped?: number;
};

function readSummary(raw: unknown): SummaryShape {
  return (raw ?? {}) as SummaryShape;
}

/**
 * Status-appropriate one-line breakdown for a batch row.
 *
 * The `summaryJson` blob carries every counter, but the **meaningful** ones
 * differ by batch phase:
 *   - staged                   → all rows are pending, no validation yet
 *   - validated / partial      → valid vs. invalid+conflict is what matters
 *   - committed / partial-post → how many made it to live state, how many
 *                                got flipped at commit, how many skipped
 *   - rejected / cancelled     → show the last snapshot we saw before the
 *                                operator stopped the batch
 *
 * Keeping this narrow avoids misleading "0 valid · 0 issues" rows on staged
 * batches and hides the committed count on pre-commit batches.
 */
function summaryLine(status: BatchStatus, s: SummaryShape): string {
  const parts: string[] = [];
  const invalidPlusConflict = (s.invalid ?? 0) + (s.conflict ?? 0);

  if (status === 'staged') {
    parts.push(`${s.pending ?? s.totalRows ?? 0} pending`);
  } else if (status === 'validated' || status === 'partially_valid') {
    parts.push(`${s.valid ?? 0} valid`);
    parts.push(
      `${invalidPlusConflict} issue${invalidPlusConflict !== 1 ? 's' : ''}`,
    );
    if (s.skipped) parts.push(`${s.skipped} skipped`);
  } else if (status === 'committed') {
    parts.push(`${s.committed ?? 0} committed`);
    if (s.skipped) parts.push(`${s.skipped} skipped`);
    if (invalidPlusConflict) {
      parts.push(
        `${invalidPlusConflict} issue${invalidPlusConflict !== 1 ? 's' : ''}`,
      );
    }
  } else {
    // rejected / cancelled — surface whatever we last knew
    if (s.valid) parts.push(`${s.valid} valid`);
    if (invalidPlusConflict) {
      parts.push(
        `${invalidPlusConflict} issue${invalidPlusConflict !== 1 ? 's' : ''}`,
      );
    }
    if (s.committed) parts.push(`${s.committed} committed`);
    if (parts.length === 0) parts.push('no progress');
  }

  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportBatchList() {
  const [importType, setImportType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const take = 25;

  const queryInput = {
    importType: importType !== 'all' ? (importType as ImportType) : undefined,
    status: status !== 'all' ? (status as BatchStatus) : undefined,
    skip: page * take,
    take,
  };

  const { data, isLoading } = trpc.import.listAll.useQuery(queryInput);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / take);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sheet Imports"
        description="Upload, review, and commit budget baseline and IPA history sheets. Staging is isolated from live data until commit."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload sheet
          </Button>
        }
      />

      {/* Upload templates — download-ready XLSX/CSV with sample rows +
          instructions sheet. The schemas match the validators at
          packages/core/src/import/validators/*. Operators should edit
          these templates and upload via the button above. */}
      <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-xs flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-medium">Download template:</span>
        <a
          href="/api/templates/budget-baseline?format=xlsx"
          download
          className="text-primary hover:underline"
        >
          Budget baseline (.xlsx)
        </a>
        <span className="text-muted-foreground/40">·</span>
        <a
          href="/api/templates/budget-baseline?format=csv"
          download
          className="text-primary hover:underline"
        >
          (.csv)
        </a>
        <span className="text-muted-foreground/40">|</span>
        <a
          href="/api/templates/ipa-history?format=xlsx"
          download
          className="text-primary hover:underline"
        >
          IPA history (.xlsx)
        </a>
        <span className="text-muted-foreground/40">·</span>
        <a
          href="/api/templates/ipa-history?format=csv"
          download
          className="text-primary hover:underline"
        >
          (.csv)
        </a>
      </div>

      <ImportUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={importType}
          onValueChange={(v) => {
            setImportType(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Import type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All import types</SelectItem>
            <SelectItem value="budget_baseline">Budget baseline</SelectItem>
            <SelectItem value="ipa_history">IPA history</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="staged">Staged</SelectItem>
            <SelectItem value="validated">Validated</SelectItem>
            <SelectItem value="partially_valid">Partially valid</SelectItem>
            <SelectItem value="committed">Committed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <span className="ml-auto text-sm text-muted-foreground">
          {total} batch{total !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <p className="py-8 text-center text-muted-foreground">
          Loading batches…
        </p>
      )}

      {/* Empty */}
      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={FileSpreadsheet}
          title="No import batches"
          description="Nothing has been uploaded yet, or no batches match these filters."
          action={{
            label: 'Upload sheet',
            onClick: () => setUploadOpen(true),
          }}
        />
      )}

      {/* Table */}
      {!isLoading && items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Project
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    File
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Rows
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Uploaded
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => {
                  const summary = readSummary(b.summaryJson);
                  return (
                    <tr
                      key={b.id}
                      className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/imports/${b.id}`}
                          className="block"
                        >
                          <div className="font-medium">
                            {b.project?.code ?? b.projectId.slice(0, 8)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {b.project?.name ?? '—'}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/imports/${b.id}`} className="block">
                          <Badge variant="outline" className="font-mono text-xs">
                            {IMPORT_TYPE_LABELS[b.importType as ImportType] ??
                              b.importType}
                          </Badge>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/imports/${b.id}`} className="block">
                          <div className="max-w-xs truncate">
                            {b.sourceFileName}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {b.sourceFileHash.slice(0, 12)}…
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/imports/${b.id}`} className="block">
                          <div className="font-medium">
                            {summary.totalRows ?? '—'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {summaryLine(b.status as BatchStatus, summary)}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/imports/${b.id}`} className="block">
                          <BatchStatusBadge status={b.status as BatchStatus} />
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        <Link href={`/admin/imports/${b.id}`} className="block">
                          <div>{formatDateTime(b.createdAt)}</div>
                          <div
                            className="text-xs"
                            title={b.uploader?.email ?? undefined}
                          >
                            by {b.uploader?.name ?? `${b.uploadedBy.slice(0, 8)}…`}
                          </div>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
