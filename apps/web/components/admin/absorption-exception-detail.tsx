'use client';

/**
 * Absorption exception detail sheet — side drawer with full details
 * and resolve action.
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Label } from '@fmksa/ui/components/label';
import { Separator } from '@fmksa/ui/components/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@fmksa/ui/components/sheet';
import { Textarea } from '@fmksa/ui/components/textarea';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '--';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ABSORPTION_TYPE_LABELS: Record<string, string> = {
  po_commitment: 'PO Commitment',
  po_reversal: 'PO Reversal',
  si_actual: 'Supplier Invoice Actual',
  expense_actual: 'Expense Actual',
  cn_reversal: 'Credit Note Reversal',
  ei_reserve_increase: 'EI Reserve Increase',
  ei_reserve_release: 'EI Reserve Release',
};

/**
 * Build a direct link to the source record's detail page.
 * Returns null if the record type has no known route.
 */
function buildSourceRecordHref(
  projectId: string,
  recordType: string,
  recordId: string,
): string | null {
  const base = `/projects/${projectId}`;
  switch (recordType) {
    case 'purchase_order':
      return `${base}/procurement/purchase-orders/${recordId}`;
    case 'supplier_invoice':
      return `${base}/procurement/supplier-invoices/${recordId}`;
    case 'expense':
      return `${base}/procurement/expenses/${recordId}`;
    case 'credit_note':
      return `${base}/procurement/credit-notes/${recordId}`;
    default:
      return null;
  }
}

const REASON_LABELS: Record<string, string> = {
  no_category: 'No matching budget category for this source record',
  no_budget: 'No budget exists for the project',
  no_budget_category: 'Budget category does not exist',
  no_budget_line: 'Budget line missing for this category',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type AbsorptionExceptionDetailProps = {
  exceptionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AbsorptionExceptionDetail({
  exceptionId,
  open,
  onOpenChange,
}: AbsorptionExceptionDetailProps) {
  const [resolveNote, setResolveNote] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);

  const utils = trpc.useUtils();

  const { data: exception, isLoading } = trpc.budget.exceptionDetail.useQuery(
    { id: exceptionId! },
    { enabled: !!exceptionId && open },
  );

  const resolveMutation = trpc.budget.resolveException.useMutation({
    onSuccess: () => {
      toast.success('Exception resolved successfully.');
      setResolveNote('');
      setShowResolveForm(false);
      utils.budget.allExceptions.invalidate();
      utils.budget.exceptionDetail.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to resolve: ${err.message}`);
    },
  });

  const isResolved = exception?.status === 'resolved';

  function handleResolve() {
    if (!exceptionId || !resolveNote.trim()) return;
    resolveMutation.mutate({ id: exceptionId, note: resolveNote.trim() });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Absorption Exception</SheetTitle>
          <SheetDescription>
            {exception
              ? `${ABSORPTION_TYPE_LABELS[exception.absorptionType] ?? exception.absorptionType} - ${exception.id.slice(0, 8)}`
              : 'Loading...'}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {exception && (
          <div className="mt-6 space-y-6">
            {/* Status + severity badges */}
            <div className="flex items-center gap-2">
              {isResolved ? (
                <Badge
                  variant="secondary"
                  className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Resolved
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Open
                </Badge>
              )}
              {exception.severity === 'error' ? (
                <Badge variant="destructive">Error</Badge>
              ) : (
                <Badge variant="outline">Warning</Badge>
              )}
            </div>

            {/* Details grid */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Details</h3>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <span className="text-muted-foreground">Project</span>
                <span>
                  {exception.project.name}{' '}
                  <span className="text-xs font-mono text-muted-foreground">
                    ({exception.project.code})
                  </span>
                </span>

                <span className="text-muted-foreground">Module</span>
                <span>{exception.sourceModule}</span>

                <span className="text-muted-foreground">Absorption Type</span>
                <Badge variant="outline" className="font-mono text-xs w-fit">
                  {ABSORPTION_TYPE_LABELS[exception.absorptionType] ?? exception.absorptionType}
                </Badge>

                <span className="text-muted-foreground">Source Record</span>
                {(() => {
                  const href = buildSourceRecordHref(
                    exception.project.id ?? exception.projectId,
                    exception.sourceRecordType,
                    exception.sourceRecordId,
                  );
                  return href ? (
                    <Link
                      href={href}
                      className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                    >
                      {exception.sourceRecordType}/{exception.sourceRecordId.slice(0, 8)}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="font-mono text-xs">
                      {exception.sourceRecordType}/{exception.sourceRecordId}
                    </span>
                  );
                })()}

                <span className="text-muted-foreground">Created At</span>
                <span>{formatDateTime(exception.createdAt)}</span>
              </div>
            </div>

            <Separator />

            {/* Reason — highlighted */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Reason</h3>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium">
                  {REASON_LABELS[exception.reasonCode] ?? exception.reasonCode}
                </p>
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                  {exception.message}
                </p>
              </div>
            </div>

            {/* Resolution info */}
            {isResolved && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Resolution</h3>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                    <span className="text-muted-foreground">Resolved By</span>
                    <span className="font-mono text-xs">{exception.resolvedBy ?? '--'}</span>

                    <span className="text-muted-foreground">Resolved At</span>
                    <span>{formatDateTime(exception.resolvedAt)}</span>

                    <span className="text-muted-foreground">Note</span>
                    <span>{exception.resolutionNote ?? '--'}</span>
                  </div>
                </div>
              </>
            )}

            {/* Resolve action (only for open exceptions) */}
            {!isResolved && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Actions</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResolveForm(!showResolveForm)}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Resolve Manually
                  </Button>

                  {showResolveForm && (
                    <div className="space-y-3 rounded-md border p-3">
                      <div className="space-y-2">
                        <Label htmlFor="resolve-note">
                          Resolution Note <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                          id="resolve-note"
                          placeholder="Explain why this exception is being resolved manually (e.g., budget created, line added, record cancelled)..."
                          value={resolveNote}
                          onChange={(e) => setResolveNote(e.target.value)}
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleResolve}
                          disabled={!resolveNote.trim() || resolveMutation.isPending}
                        >
                          {resolveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : null}
                          Confirm Resolve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowResolveForm(false);
                            setResolveNote('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
