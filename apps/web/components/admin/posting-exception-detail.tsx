'use client';

/**
 * Posting exception detail component -- side drawer with event details,
 * failure reason, audit logs, and retry/resolve actions.
 *
 * Task 1.7.8
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
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
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

function formatReason(reason: string): string {
  // Make common prefixes more readable
  return reason
    .replace(/^retry_failed:\s*/i, 'Retry failed: ')
    .replace(/^payload_validation_failed$/i, 'Payload validation failed');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type PostingExceptionDetailProps = {
  exceptionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PostingExceptionDetail({
  exceptionId,
  open,
  onOpenChange,
}: PostingExceptionDetailProps) {
  const [resolveNote, setResolveNote] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.posting.exceptions.get.useQuery(
    { id: exceptionId! },
    { enabled: !!exceptionId && open },
  );

  const retryMutation = trpc.posting.exceptions.retry.useMutation({
    onSuccess: (result) => {
      if (result?.success) {
        toast.success('Exception retried successfully. A new event was created.');
        utils.posting.exceptions.list.invalidate();
        utils.posting.exceptions.get.invalidate();
      } else {
        toast.error(`Retry failed: ${result?.error ?? 'Unknown error'}`);
      }
    },
    onError: (err) => {
      toast.error(`Retry failed: ${err.message}`);
    },
  });

  const resolveMutation = trpc.posting.exceptions.resolve.useMutation({
    onSuccess: () => {
      toast.success('Exception resolved successfully.');
      setResolveNote('');
      setShowResolveForm(false);
      utils.posting.exceptions.list.invalidate();
      utils.posting.exceptions.get.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to resolve: ${err.message}`);
    },
  });

  const exception = data?.exception;
  const auditLogs = data?.auditLogs ?? [];
  const event = exception?.event;
  const isResolved = !!exception?.resolvedAt;

  function handleRetry() {
    if (!exceptionId) return;
    retryMutation.mutate({ exceptionId });
  }

  function handleResolve() {
    if (!exceptionId || !resolveNote.trim()) return;
    resolveMutation.mutate({ exceptionId, note: resolveNote.trim() });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Exception Detail</SheetTitle>
          <SheetDescription>
            {exception
              ? `${exception.event.eventType} - ${exception.id.slice(0, 8)}`
              : 'Loading...'}
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {exception && event && (
          <div className="mt-6 space-y-6">
            {/* Status badge */}
            <div>
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
            </div>

            {/* Event details */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Event Details
              </h3>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <span className="text-muted-foreground">Event Type</span>
                <Badge variant="outline" className="font-mono text-xs w-fit">
                  {event.eventType}
                </Badge>

                <span className="text-muted-foreground">Source Service</span>
                <span>{event.sourceService}</span>

                <span className="text-muted-foreground">Source Record</span>
                <span className="font-mono text-xs">
                  {event.sourceRecordType}/{event.sourceRecordId}
                </span>

                <span className="text-muted-foreground">Project ID</span>
                <span className="font-mono text-xs">{event.projectId}</span>

                <span className="text-muted-foreground">Event Status</span>
                <span>{event.status}</span>

                <span className="text-muted-foreground">Created At</span>
                <span>{formatDateTime(event.createdAt)}</span>

                <span className="text-muted-foreground">Idempotency Key</span>
                <span className="font-mono text-xs break-all">
                  {event.idempotencyKey}
                </span>
              </div>
            </div>

            <Separator />

            {/* Failure reason -- highlighted */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                Failure Reason
              </h3>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm text-destructive whitespace-pre-wrap">
                  {formatReason(exception.reason)}
                </p>
                {event.failureReason && event.failureReason !== exception.reason && (
                  <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                    Original event error: {event.failureReason}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Payload */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                Payload
              </h3>
              <pre className="rounded-md border bg-muted/50 p-3 text-xs overflow-x-auto max-h-48">
                {JSON.stringify(event.payloadJson, null, 2)}
              </pre>
            </div>

            {/* Resolution info (if resolved) */}
            {isResolved && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Resolution
                  </h3>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                    <span className="text-muted-foreground">Resolved By</span>
                    <span className="font-mono text-xs">
                      {exception.resolvedBy ?? '--'}
                    </span>

                    <span className="text-muted-foreground">Resolved At</span>
                    <span>{formatDateTime(exception.resolvedAt)}</span>

                    <span className="text-muted-foreground">Note</span>
                    <span>{exception.resolutionNote ?? '--'}</span>
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Audit logs */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                Audit Logs
              </h3>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No audit log entries.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-md border p-2 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">
                          {log.action}
                        </Badge>
                        <span className="text-muted-foreground">
                          {formatDateTime(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        Actor: {log.actorUserId?.slice(0, 8) ?? 'system'} (
                        {log.actorSource})
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions (only for open exceptions) */}
            {!isResolved && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Actions
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleRetry}
                      disabled={retryMutation.isPending}
                    >
                      {retryMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      )}
                      Retry
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowResolveForm(!showResolveForm)}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Resolve Manually
                    </Button>
                  </div>

                  {/* Resolve form */}
                  {showResolveForm && (
                    <div className="space-y-3 rounded-md border p-3">
                      <div className="space-y-2">
                        <Label htmlFor="resolve-note">
                          Resolution Note{' '}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                          id="resolve-note"
                          placeholder="Explain why this exception is being resolved manually..."
                          value={resolveNote}
                          onChange={(e) => setResolveNote(e.target.value)}
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleResolve}
                          disabled={
                            !resolveNote.trim() || resolveMutation.isPending
                          }
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
