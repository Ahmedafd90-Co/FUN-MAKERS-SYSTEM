'use client';

/**
 * Posting exception list component -- shows exceptions with filters.
 *
 * Task 1.7.8
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
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a date as a human-readable "time ago" string.
 */
function formatAge(createdAt: string | Date): string {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h ago`;
  if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m ago`;
  return `${diffMins}m ago`;
}

/**
 * Format a failure reason to be human-readable (strip prefixes, truncate).
 */
function formatReason(reason: string): string {
  // Strip common prefixes
  const cleaned = reason
    .replace(/^retry_failed:\s*/i, '')
    .replace(/^payload_validation_failed:\s*/i, '');
  // Truncate to 80 chars for table display
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type PostingExceptionListProps = {
  onSelectException: (id: string) => void;
};

export function PostingExceptionList({
  onSelectException,
}: PostingExceptionListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const take = 25;

  const queryInput = {
    status:
      statusFilter === 'open'
        ? ('open' as const)
        : statusFilter === 'resolved'
          ? ('resolved' as const)
          : undefined,
    eventType: eventTypeFilter !== 'all' ? eventTypeFilter : undefined,
    skip: page * take,
    take,
  };

  const { data, isLoading } = trpc.posting.exceptions.list.useQuery(queryInput);

  const exceptions = data?.exceptions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / take);

  // Collect unique event types for filter dropdown
  const eventTypes = Array.from(
    new Set(exceptions.map((e) => e.event.eventType)),
  ).sort();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Posting Exceptions
        </h1>
        <p className="text-sm text-muted-foreground">
          Monitor and manage posting pipeline failures. Open exceptions
          require attention.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={eventTypeFilter} onValueChange={(v) => { setEventTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All event types</SelectItem>
            {eventTypes.map((et) => (
              <SelectItem key={et} value={et}>
                {et}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {total} exception{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading state */}
      {isLoading && (
        <p className="text-muted-foreground py-8 text-center">
          Loading exceptions...
        </p>
      )}

      {/* Empty state */}
      {!isLoading && exceptions.length === 0 && (
        <div className="py-12 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-500 mb-3" />
          <p className="text-muted-foreground">
            No posting exceptions. The posting pipeline is healthy.
          </p>
        </div>
      )}

      {/* Table */}
      {!isLoading && exceptions.length > 0 && (
        <>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Event Type
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Project
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Source Record
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Failure Reason
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Age
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((exc) => (
                  <tr
                    key={exc.id}
                    onClick={() => onSelectException(exc.id)}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="font-mono text-xs">
                        {exc.event.eventType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {exc.event.projectId.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="font-mono text-xs">
                        {exc.event.sourceRecordType}/{exc.event.sourceRecordId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-destructive text-xs">
                        {formatReason(exc.reason)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatAge(exc.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {exc.resolvedAt ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        >
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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
