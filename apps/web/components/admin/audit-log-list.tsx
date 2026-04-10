'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
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
import { ScrollText } from 'lucide-react';
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

function formatAction(action: string): string {
  return action.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AuditLogList() {
  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('all');
  const [actorSourceFilter, setActorSourceFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const take = 25;

  const { data, isLoading } = trpc.audit.list.useQuery({
    action: actionFilter || undefined,
    resourceType: resourceTypeFilter !== 'all' ? resourceTypeFilter : undefined,
    actorSource: actorSourceFilter !== 'all' ? actorSourceFilter : undefined,
    skip: page * take,
    take,
  });

  const { data: detail } = trpc.audit.get.useQuery(
    { id: detailId! },
    { enabled: !!detailId },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / take);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Log"
        description="Chronological record of all system actions."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by action..."
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
          className="w-48"
        />
        <Select value={resourceTypeFilter} onValueChange={(v) => { setResourceTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Resource type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All resource types</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="role">Role</SelectItem>
            <SelectItem value="project">Project</SelectItem>
            <SelectItem value="entity">Entity</SelectItem>
            <SelectItem value="workflow_instance">Workflow</SelectItem>
            <SelectItem value="notification">Notification</SelectItem>
            <SelectItem value="notification_template">Notif. Template</SelectItem>
            <SelectItem value="posting_event">Posting Event</SelectItem>
          </SelectContent>
        </Select>
        <Select value={actorSourceFilter} onValueChange={(v) => { setActorSourceFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Actor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actors</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="job">Job</SelectItem>
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
          icon={ScrollText}
          title="No audit log entries"
          description="Entries will appear here as actions are performed in the system."
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
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actor</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Resource</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Resource ID</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setDetailId(entry.id)}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {entry.actorUserId ? entry.actorUserId.slice(0, 8) + '...' : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{entry.actorSource}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">{formatAction(entry.action)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="font-mono text-xs">{entry.resourceType}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {entry.resourceId.slice(0, 8)}...
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
            <SheetTitle>Audit Log Detail</SheetTitle>
          </SheetHeader>
          {detail && (
            <div className="mt-4 space-y-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-mono text-xs">{detail.id}</dd>
                <dt className="text-muted-foreground">Timestamp</dt>
                <dd>{formatDate(detail.createdAt)}</dd>
                <dt className="text-muted-foreground">Actor Source</dt>
                <dd>{detail.actorSource}</dd>
                <dt className="text-muted-foreground">Actor User ID</dt>
                <dd className="font-mono text-xs">{detail.actorUserId ?? '—'}</dd>
                <dt className="text-muted-foreground">Action</dt>
                <dd>{formatAction(detail.action)}</dd>
                <dt className="text-muted-foreground">Resource Type</dt>
                <dd>{detail.resourceType}</dd>
                <dt className="text-muted-foreground">Resource ID</dt>
                <dd className="font-mono text-xs">{detail.resourceId}</dd>
                {detail.projectId && (
                  <>
                    <dt className="text-muted-foreground">Project ID</dt>
                    <dd className="font-mono text-xs">{detail.projectId}</dd>
                  </>
                )}
                {detail.reason && (
                  <>
                    <dt className="text-muted-foreground">Reason</dt>
                    <dd>{detail.reason}</dd>
                  </>
                )}
              </dl>

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
