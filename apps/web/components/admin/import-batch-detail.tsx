'use client';

/**
 * Import batch detail — the review queue for a single ImportBatch.
 *
 * Shows:
 *   - Header: project, import type, file + hash, uploader, timing, status
 *   - Summary pills (total / valid / invalid / conflict / committed / skipped)
 *   - Freshness info (parserVersion, validatorSchemaVersion, validationRanAt)
 *   - Action bar (Validate / Commit / Cancel / Reject) — gated by batch.status
 *   - Row table with per-row status, preview, expand to see raw/parsed/errors
 *   - Per-row "Exclude" action
 *   - Committed rows show the committed record link
 *
 * Action lifecycle is enforced on the server via `ImportBatchNotReadyError`;
 * this UI simply reflects which actions the server will currently accept.
 */
import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fmksa/ui/components/dialog';
import { Label } from '@fmksa/ui/components/label';
import { Separator } from '@fmksa/ui/components/separator';
import { Textarea } from '@fmksa/ui/components/textarea';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  Loader2,
  PlayCircle,
  SkipForward,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/layout/page-header';
import { statusBadgeStyle } from '@/lib/badge-variants';
import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Types + helpers
// ---------------------------------------------------------------------------

type ImportType = 'budget_baseline' | 'ipa_history';
type BatchStatus =
  | 'staged'
  | 'validated'
  | 'partially_valid'
  | 'committed'
  | 'rejected'
  | 'cancelled';
type RowStatus =
  | 'pending'
  | 'valid'
  | 'invalid'
  | 'conflict'
  | 'committed'
  | 'skipped';

type ImportIssue = {
  code: string;
  field?: string | null;
  message: string;
};

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  budget_baseline: 'Budget baseline',
  ipa_history: 'IPA history',
};

const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  staged: 'Staged',
  validated: 'Validated',
  partially_valid: 'Partially valid',
  committed: 'Committed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const ROW_STATUS_LABELS: Record<RowStatus, string> = {
  pending: 'Pending',
  valid: 'Valid',
  invalid: 'Invalid',
  conflict: 'Conflict',
  committed: 'Committed',
  skipped: 'Skipped',
};

function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
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
              : 'archived';
  const style = statusBadgeStyle(mapped);
  return (
    <Badge variant={style.variant} className={style.className}>
      {BATCH_STATUS_LABELS[status]}
    </Badge>
  );
}

function RowStatusBadge({ status }: { status: RowStatus }) {
  const mapped =
    status === 'valid'
      ? 'active'
      : status === 'committed'
        ? 'approved'
        : status === 'invalid'
          ? 'rejected'
          : status === 'conflict'
            ? 'failed'
            : status === 'skipped'
              ? 'archived'
              : 'pending';
  const style = statusBadgeStyle(mapped);
  return (
    <Badge variant={style.variant} className={style.className}>
      {ROW_STATUS_LABELS[status]}
    </Badge>
  );
}

function rowPreview(
  importType: ImportType,
  parsedJson: unknown,
  rawJson: unknown,
): string {
  const src = (parsedJson ?? rawJson ?? {}) as Record<string, unknown>;
  if (importType === 'budget_baseline') {
    const code = String(src.categoryCode ?? src['Category Code'] ?? '—');
    const amount = String(src.budgetAmount ?? src['Budget Amount'] ?? '—');
    return `${code} — ${amount}`;
  }
  const period = String(src.periodNumber ?? src['Period'] ?? '—');
  const from = String(src.periodFrom ?? src['Period From'] ?? '—');
  const to = String(src.periodTo ?? src['Period To'] ?? '—');
  const gross = String(src.grossAmount ?? src['Gross Amount'] ?? '—');
  return `Period ${period} (${from} → ${to}) · gross ${gross}`;
}

function asIssues(raw: unknown): ImportIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw as ImportIssue[];
}

function readSummary(raw: unknown): {
  totalRows?: number;
  pending?: number;
  valid?: number;
  invalid?: number;
  conflict?: number;
  committed?: number;
  skipped?: number;
} {
  return (raw ?? {}) as {
    totalRows?: number;
    pending?: number;
    valid?: number;
    invalid?: number;
    conflict?: number;
    committed?: number;
    skipped?: number;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ImportBatchDetailProps = {
  batchId: string;
};

export function ImportBatchDetail({ batchId }: ImportBatchDetailProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [commitConfirmOpen, setCommitConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const { data: batch, isLoading, error } = trpc.import.getAdmin.useQuery({
    batchId,
  });

  const validateMutation = trpc.import.validate.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Validated: ${res?.valid ?? 0} valid, ${res?.invalid ?? 0} invalid, ${res?.conflict ?? 0} conflict.`,
      );
      void utils.import.getAdmin.invalidate({ batchId });
      void utils.import.listAll.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const commitMutation = trpc.import.commit.useMutation({
    onSuccess: (res) => {
      const committed = res?.committed ?? 0;
      const newlyInvalid = res?.newlyInvalid ?? 0;
      toast.success(
        `Committed ${committed} row${committed !== 1 ? 's' : ''}${
          newlyInvalid > 0
            ? `, ${newlyInvalid} flipped to invalid`
            : ''
        }.`,
      );
      setCommitConfirmOpen(false);
      void utils.import.getAdmin.invalidate({ batchId });
      void utils.import.listAll.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const rejectMutation = trpc.import.reject.useMutation({
    onSuccess: () => {
      toast.success('Batch rejected. Live state untouched.');
      setRejectOpen(false);
      setRejectReason('');
      void utils.import.getAdmin.invalidate({ batchId });
      void utils.import.listAll.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const cancelMutation = trpc.import.cancel.useMutation({
    onSuccess: () => {
      toast.success('Batch cancelled. Live state untouched.');
      setCancelConfirmOpen(false);
      void utils.import.getAdmin.invalidate({ batchId });
      void utils.import.listAll.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const excludeMutation = trpc.import.excludeRow.useMutation({
    onSuccess: () => {
      toast.success('Row excluded from commit.');
      void utils.import.getAdmin.invalidate({ batchId });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !batch) {
    return (
      <ErrorState
        title="Could not load batch"
        description={error?.message ?? 'Batch not found.'}
        onRetry={() => router.refresh()}
      />
    );
  }

  const status = batch.status as BatchStatus;
  const importType = batch.importType as ImportType;
  const summary = readSummary(batch.summaryJson);
  const rows = batch.rows ?? [];

  const canValidate =
    status === 'staged' ||
    status === 'validated' ||
    status === 'partially_valid';
  const canCommit =
    (status === 'validated' || status === 'partially_valid') &&
    (summary.valid ?? 0) > 0;
  const canCancel = status === 'staged';
  const canReject =
    status === 'staged' ||
    status === 'validated' ||
    status === 'partially_valid';

  // Freshness banner — show if validated/partially_valid and hash drifted
  // since validation. Server ultimately enforces this in commitBatch().
  const hashDrift =
    batch.sourceFileHashAtValidation !== null &&
    batch.sourceFileHashAtValidation !== batch.sourceFileHash;

  function toggleExpand(rowId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={batch.sourceFileName}
        description={`${IMPORT_TYPE_LABELS[importType]} · ${batch.project.code} — ${batch.project.name}`}
        actions={
          <Link
            href="/admin/imports"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to imports
          </Link>
        }
      />

      {/* Header card */}
      <div className="rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BatchStatusBadge status={status} />
              <Badge variant="outline" className="font-mono text-xs">
                {IMPORT_TYPE_LABELS[importType]}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-mono text-xs">
                hash {batch.sourceFileHash.slice(0, 16)}…
              </span>
              <span className="mx-2">·</span>
              Uploaded {formatDateTime(batch.createdAt)}
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap gap-2">
            {canValidate && (
              <Button
                variant="outline"
                size="sm"
                disabled={validateMutation.isPending}
                onClick={() =>
                  validateMutation.mutate({
                    projectId: batch.projectId,
                    batchId: batch.id,
                  })
                }
              >
                {validateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 h-4 w-4" />
                )}
                {status === 'staged' ? 'Validate' : 'Re-validate'}
              </Button>
            )}
            {canCommit && (
              <Button
                size="sm"
                disabled={commitMutation.isPending}
                onClick={() => setCommitConfirmOpen(true)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Commit {summary.valid ?? 0} row
                {(summary.valid ?? 0) !== 1 ? 's' : ''}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                disabled={cancelMutation.isPending}
                onClick={() => setCancelConfirmOpen(true)}
              >
                <Ban className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
            {canReject && (
              <Button
                variant="destructive"
                size="sm"
                disabled={rejectMutation.isPending}
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            )}
          </div>
        </div>

        {/* Freshness banner */}
        {hashDrift && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="text-xs">
              <strong>Validation is stale.</strong> The source file hash has
              changed since validation ran. Re-validate before committing —
              the server will refuse the commit otherwise.
            </div>
          </div>
        )}

        {/* Summary pills */}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <SummaryPill label="Total" value={summary.totalRows ?? rows.length} />
          <SummaryPill label="Pending" value={summary.pending ?? 0} />
          <SummaryPill label="Valid" value={summary.valid ?? 0} tone="green" />
          <SummaryPill
            label="Invalid"
            value={summary.invalid ?? 0}
            tone="red"
          />
          <SummaryPill
            label="Conflict"
            value={summary.conflict ?? 0}
            tone="red"
          />
          <SummaryPill
            label="Committed"
            value={summary.committed ?? 0}
            tone="green"
          />
          <SummaryPill
            label="Skipped"
            value={summary.skipped ?? 0}
            tone="muted"
          />
        </div>

        <Separator className="my-4" />

        {/* Metadata grid */}
        <div className="grid grid-cols-1 gap-y-2 gap-x-6 text-sm sm:grid-cols-2">
          <MetaRow label="Uploaded by">
            <ActorName
              user={batch.uploader}
              fallbackId={batch.uploadedBy}
            />
          </MetaRow>
          <MetaRow label="Validation ran">
            {formatDateTime(batch.validationRanAt)}
          </MetaRow>
          <MetaRow label="Parser version">
            <span className="font-mono text-xs">
              {batch.parserVersion ?? '—'}
            </span>
          </MetaRow>
          <MetaRow label="Validator schema">
            <span className="font-mono text-xs">
              {batch.validatorSchemaVersion ?? '—'}
            </span>
          </MetaRow>
          <MetaRow label="Committed at">
            {formatDateTime(batch.committedAt)}
          </MetaRow>
          <MetaRow label="Committed by">
            <ActorName
              user={batch.committer}
              fallbackId={batch.committedBy}
            />
          </MetaRow>
          {batch.cancelledAt && (
            <MetaRow label="Cancelled by">
              <ActorName
                user={batch.canceller}
                fallbackId={batch.cancelledBy}
              />
            </MetaRow>
          )}
          {batch.rejectedAt && (
            <MetaRow label="Rejected by">
              <ActorName
                user={batch.rejecter}
                fallbackId={batch.rejectedBy}
              />
            </MetaRow>
          )}
          {batch.rejectReason && (
            <MetaRow label="Reject reason">{batch.rejectReason}</MetaRow>
          )}
        </div>
      </div>

      {/* Row table */}
      <div>
        <h2 className="mb-3 text-sm font-semibold">Rows</h2>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No rows parsed from this sheet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-10 px-2 py-2"></th>
                  <th className="w-16 px-2 py-2 text-left font-medium text-muted-foreground">
                    #
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Preview
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                    Issue
                  </th>
                  <th className="w-24 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isExpanded = expandedRows.has(row.id);
                  const rowStatus = row.status as RowStatus;
                  const errors = asIssues(row.validationErrorsJson);
                  const warnings = asIssues(row.warningsJson);
                  const firstIssue =
                    errors[0]?.message ??
                    (row.conflictJson ? 'conflict' : null) ??
                    warnings[0]?.message ??
                    null;
                  const canExclude =
                    rowStatus !== 'committed' &&
                    rowStatus !== 'skipped' &&
                    status !== 'committed' &&
                    status !== 'rejected' &&
                    status !== 'cancelled';

                  return (
                    <ExpandableRow
                      key={row.id}
                      row={row}
                      projectId={batch.projectId}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpand(row.id)}
                      onExclude={() =>
                        excludeMutation.mutate({
                          projectId: batch.projectId,
                          rowId: row.id,
                        })
                      }
                      excluding={excludeMutation.isPending}
                      rowStatus={rowStatus}
                      firstIssue={firstIssue}
                      canExclude={canExclude}
                      importType={importType}
                      errors={errors}
                      warnings={warnings}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Commit confirm dialog */}
      <Dialog
        open={commitConfirmOpen}
        onOpenChange={(o) => !commitMutation.isPending && setCommitConfirmOpen(o)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commit {summary.valid ?? 0} rows?</DialogTitle>
            <DialogDescription>
              This will write {summary.valid ?? 0} row
              {(summary.valid ?? 0) !== 1 ? 's' : ''} into live truth and emit
              posting events. Invalid / conflict / skipped rows are left
              alone. This cannot be undone — a posted ledger event is
              permanent. Before committing, the server re-checks parser
              version, validator schema version, reference data snapshot, and
              source file hash. If any drifted, commit is refused.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCommitConfirmOpen(false)}
              disabled={commitMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                commitMutation.mutate({
                  projectId: batch.projectId,
                  batchId: batch.id,
                })
              }
              disabled={commitMutation.isPending}
            >
              {commitMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog with reason */}
      <Dialog
        open={rejectOpen}
        onOpenChange={(o) => {
          if (!rejectMutation.isPending) {
            setRejectOpen(o);
            if (!o) setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject batch</DialogTitle>
            <DialogDescription>
              Rejecting is permanent. The batch cannot be re-validated or
              committed afterwards. Live state stays untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why are you rejecting this batch?"
              rows={3}
              disabled={rejectMutation.isPending}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRejectOpen(false)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                rejectMutation.mutate({
                  projectId: batch.projectId,
                  batchId: batch.id,
                  reason: rejectReason.trim(),
                })
              }
              disabled={rejectMutation.isPending || !rejectReason.trim()}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Reject batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <Dialog
        open={cancelConfirmOpen}
        onOpenChange={(o) =>
          !cancelMutation.isPending && setCancelConfirmOpen(o)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this staged batch?</DialogTitle>
            <DialogDescription>
              Cancelling aborts the batch before validation. Live state is
              untouched. Use this when you uploaded the wrong file and want
              to clear it from the queue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCancelConfirmOpen(false)}
              disabled={cancelMutation.isPending}
            >
              Keep batch
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                cancelMutation.mutate({
                  projectId: batch.projectId,
                  batchId: batch.id,
                })
              }
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Ban className="mr-2 h-4 w-4" />
              )}
              Cancel batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'green' | 'red' | 'muted';
}) {
  const colour =
    tone === 'green'
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : tone === 'red'
        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
        : tone === 'muted'
          ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
          : 'bg-muted text-muted-foreground';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${colour}`}
    >
      <span className="font-medium">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate">{children}</span>
    </div>
  );
}

/**
 * Show a user's display name resolved from the `uploader` / `committer`
 * lookup the import service does, falling back to a short UUID fragment if
 * the user row is missing (deleted account, out-of-band seed, etc.).
 */
function ActorName({
  user,
  fallbackId,
}: {
  user: { id: string; name: string; email: string } | null | undefined;
  fallbackId: string | null | undefined;
}) {
  if (user) {
    return (
      <span title={user.email}>
        {user.name}
      </span>
    );
  }
  if (fallbackId) {
    return (
      <span className="font-mono text-xs text-muted-foreground" title="Unknown user — only the user ID was recorded">
        {fallbackId.slice(0, 8)}…
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

type ExpandableRowProps = {
  row: {
    id: string;
    rowNumber: number;
    rawJson: unknown;
    parsedJson: unknown;
    conflictJson: unknown;
    committedRecordType: string | null;
    committedRecordId: string | null;
  };
  projectId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onExclude: () => void;
  excluding: boolean;
  rowStatus: RowStatus;
  firstIssue: string | null;
  canExclude: boolean;
  importType: ImportType;
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

function ExpandableRow({
  row,
  projectId,
  isExpanded,
  onToggle,
  onExclude,
  excluding,
  rowStatus,
  firstIssue,
  canExclude,
  importType,
  errors,
  warnings,
}: ExpandableRowProps) {
  const preview = rowPreview(importType, row.parsedJson, row.rawJson);
  const committedLink =
    row.committedRecordType && row.committedRecordId
      ? committedRecordHref(row.committedRecordType, row.committedRecordId, projectId)
      : null;

  return (
    <>
      <tr
        className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
        onClick={onToggle}
      >
        <td className="px-2 py-3 align-top">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="px-2 py-3 align-top font-mono text-xs text-muted-foreground">
          {row.rowNumber}
        </td>
        <td className="px-4 py-3 align-top">
          <div className="truncate">{preview}</div>
          {committedLink && (
            <Link
              href={committedLink}
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              View committed record →
            </Link>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          <RowStatusBadge status={rowStatus} />
        </td>
        <td className="px-4 py-3 align-top">
          {firstIssue ? (
            <span className="text-xs text-muted-foreground">
              {firstIssue.length > 80
                ? `${firstIssue.slice(0, 77)}…`
                : firstIssue}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right align-top">
          {canExclude && (
            <Button
              variant="ghost"
              size="sm"
              disabled={excluding}
              onClick={(e) => {
                e.stopPropagation();
                onExclude();
              }}
              title="Exclude this row from commit"
            >
              <SkipForward className="mr-1 h-3 w-3" />
              Exclude
            </Button>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b bg-muted/20">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <FileSpreadsheet className="h-3 w-3" /> Raw (from sheet)
                </div>
                <pre className="max-h-48 overflow-auto rounded-md border bg-background p-2 font-mono text-xs">
                  {JSON.stringify(row.rawJson, null, 2)}
                </pre>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Clock className="h-3 w-3" /> Parsed (typed)
                </div>
                <pre className="max-h-48 overflow-auto rounded-md border bg-background p-2 font-mono text-xs">
                  {row.parsedJson
                    ? JSON.stringify(row.parsedJson, null, 2)
                    : '// not yet validated'}
                </pre>
              </div>
            </div>

            {errors.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-xs font-semibold text-destructive">
                  Errors
                </div>
                <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                  {errors.map((e, i) => (
                    <li key={i}>
                      <span className="font-mono">{e.code}</span>
                      {e.field ? (
                        <>
                          {' '}
                          · <span className="font-mono">{e.field}</span>
                        </>
                      ) : null}{' '}
                      · {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Warnings
                </div>
                <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-700 dark:bg-amber-950">
                  {warnings.map((w, i) => (
                    <li key={i}>
                      <span className="font-mono">{w.code}</span>
                      {w.field ? (
                        <>
                          {' '}
                          · <span className="font-mono">{w.field}</span>
                        </>
                      ) : null}{' '}
                      · {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {row.conflictJson != null ? (
              <div className="mt-3 space-y-1">
                <div className="text-xs font-semibold text-destructive">
                  Conflict
                </div>
                <pre className="max-h-32 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 font-mono text-xs">
                  {JSON.stringify(row.conflictJson, null, 2)}
                </pre>
              </div>
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Maps `committedRecordType` (set by committers) to the live-record URL the
 * operator should be sent to when clicking "View committed record".
 *
 * Live-truth pages are nested under `/projects/{projectId}/...`, so we need
 * to thread projectId through from the batch.
 */
function committedRecordHref(type: string, id: string, projectId: string): string {
  switch (type) {
    case 'budget_line':
      // Budget lines live on the project detail; highlight the row via query param.
      return `/projects/${projectId}?focusBudgetLine=${id}`;
    case 'ipa':
      return `/projects/${projectId}/commercial/ipa/${id}`;
    default:
      return '/admin/audit-log';
  }
}
