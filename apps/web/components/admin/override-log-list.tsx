'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@fmksa/ui/components/sheet';
import { ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverrideLogList() {
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const take = 25;

  const { data, isLoading } = trpc.audit.overrides.useQuery({
    overrideType: typeFilter !== 'all' ? typeFilter : undefined,
    skip: page * take,
    take,
  });

  const { data: detail } = trpc.audit.overrideDetail.useQuery(
    { id: detailId! },
    { enabled: !!detailId },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / take);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Administration"
        title="Override Log"
        description="Record of all administrative overrides and approvals."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Override type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="workflow_override">Workflow Override</SelectItem>
            <SelectItem value="posting_override">Posting Override</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {total} entr{total !== 1 ? 'ies' : 'y'}
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={ArrowLeftRight}
          title="No override entries"
          description="Override actions will appear here when administrators use override privileges."
        />
      )}

      {/* Table */}
      {!isLoading && items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Timestamp</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Override Type</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Overrider</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reason</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Approved By</th>
                </tr>
              </thead>
              <tbody>
                {items.map(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- upstream `(prisma as any)` in packages/core/src/audit/override-list.ts erases the element type; fix that cast to remove this disable
                  (entry: any) => (
                  <tr
                    key={entry.id}
                    onClick={() => setDetailId(entry.id)}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {entry.overrideType?.replace(/_/g, ' ') ?? '—'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {entry.overriderUserId?.slice(0, 8) ?? '—'}...
                    </td>
                    <td className="px-4 py-3 text-xs max-w-xs truncate">
                      {entry.reason ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {entry.approvedBy ? entry.approvedBy.slice(0, 8) + '...' : '—'}
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
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Override Detail</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="mt-4 space-y-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-mono text-xs">{detail.id}</dd>
                <dt className="text-muted-foreground">Timestamp</dt>
                <dd>{formatDate(detail.createdAt)}</dd>
                <dt className="text-muted-foreground">Override Type</dt>
                <dd>{detail.overrideType}</dd>
                <dt className="text-muted-foreground">Overrider</dt>
                <dd className="font-mono text-xs">{detail.overriderUserId}</dd>
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{detail.reason ?? '—'}</dd>
                <dt className="text-muted-foreground">Approved By</dt>
                <dd className="font-mono text-xs">{detail.approvedBy ?? '—'}</dd>
              </dl>

              {detail.auditLog && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Linked Audit Entry</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm rounded-md border p-3 bg-muted/20">
                    <dt className="text-muted-foreground">Action</dt>
                    <dd>{detail.auditLog.action?.replace(/_/g, ' ')}</dd>
                    <dt className="text-muted-foreground">Resource</dt>
                    <dd>{detail.auditLog.resourceType} / {detail.auditLog.resourceId}</dd>
                  </dl>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium">Before</p>
                <pre className="rounded-md border bg-muted/30 p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(detail.beforeJson, null, 2)}
                </pre>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">After</p>
                <pre className="rounded-md border bg-muted/30 p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(detail.afterJson, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
