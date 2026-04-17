'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';
import { CheckCircle2, XCircle, Database, Wifi, Clock } from 'lucide-react';

import { trpc } from '@/lib/trpc-client';
import { PageHeader } from '@/components/layout/page-header';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ConnectionCard({
  label,
  icon: Icon,
  connected,
  latencyMs,
}: {
  label: string;
  icon: typeof Database;
  connected: boolean;
  latencyMs: number;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground/60" />
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        {connected ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">Connected</span>
            <span className="ml-auto text-xs text-muted-foreground">{latencyMs}ms</span>
          </>
        ) : (
          <>
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">Disconnected</span>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatTimestamp(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SystemHealthDashboard() {
  const { data, isLoading } = trpc.health.overview.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="System Health"
        description="Connection status, queue stats, and recent job failures. Refreshes every 30 seconds."
      />

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Connections */}
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Connections</h2>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <ConnectionCard label="Database" icon={Database} connected={data.db.connected} latencyMs={data.db.latencyMs} />
              <ConnectionCard label="Redis" icon={Wifi} connected={data.redis.connected} latencyMs={data.redis.latencyMs} />
            </div>
          </div>

          {/* Queues */}
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Queues</h2>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {data.queues.map((q) => (
                <Card key={q.name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium font-mono">{q.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs">Active: {q.active}</Badge>
                      <Badge variant="outline" className="text-xs">Waiting: {q.waiting}</Badge>
                      <Badge variant="outline" className="text-xs">Completed: {q.completed}</Badge>
                      {q.failed > 0 ? (
                        <Badge variant="destructive" className="text-xs">Failed: {q.failed}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Failed: 0</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">Delayed: {q.delayed}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Recent Failures */}
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Recent Failures</h2>
            {data.failedJobs.length === 0 ? (
              <Card>
                <CardContent className="flex items-center gap-2 py-6">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-muted-foreground">No failed jobs</span>
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Job</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Error</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.failedJobs.map((job, i) => (
                      <tr key={job.id ?? i} className="border-b last:border-0">
                        <td className="px-4 py-3 text-xs">{job.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{job.id ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-destructive max-w-xs truncate">{job.error}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          <Clock className="inline h-3 w-3 mr-1" />
                          {formatTimestamp(job.timestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
