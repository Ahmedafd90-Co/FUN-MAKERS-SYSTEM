'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';
import {
  CheckCircle2,
  ClipboardList,
  Bell,
  FolderKanban,
  Activity,
} from 'lucide-react';
import Link from 'next/link';

import { trpc } from '@/lib/trpc-client';
import { statusBadgeStyle } from '@/lib/badge-variants';

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </CardHeader>
          <CardContent>
            <div className="h-8 w-16 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardCards() {
  const { data, isLoading } = trpc.dashboard.summary.useQuery(undefined, {
    refetchInterval: 60_000, // refresh every minute
  });

  if (isLoading || !data) return <DashboardSkeleton />;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {/* Pending Approvals */}
      <Link href="/approvals" className="group">
        <Card className="transition-shadow group-hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Approvals
            </CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent>
            {data.pendingApprovals === 0 ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">All clear</span>
              </div>
            ) : (
              <p className="text-2xl font-bold">{data.pendingApprovals}</p>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* My Projects */}
      <Link href="/projects" className="group">
        <Card className="transition-shadow group-hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              My Projects
            </CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent>
            {data.assignedProjects.length === 0 ? (
              <span className="text-sm text-muted-foreground">No projects</span>
            ) : (
              <ul className="space-y-1">
                {data.assignedProjects.map((p) => {
                  const style = statusBadgeStyle(p.status);
                  return (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <Badge variant={style.variant} className={`${style.className ?? ''} h-4 px-1.5 text-[10px]`.trim()}>
                        {p.status}
                      </Badge>
                      <span className="truncate">{p.code} — {p.name}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* Notifications */}
      <Link href="/notifications" className="group">
        <Card className="transition-shadow group-hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Notifications
            </CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent>
            {data.unreadNotifications === 0 ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">All caught up</span>
              </div>
            ) : (
              <div>
                <p className="text-2xl font-bold">{data.unreadNotifications}</p>
                <p className="text-xs text-muted-foreground">unread</p>
              </div>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* Recent Activity (admin only) */}
      {data.isAdmin && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent Activity
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent>
            {data.recentActivity.length === 0 ? (
              <span className="text-sm text-muted-foreground">No recent activity</span>
            ) : (
              <ul className="space-y-1.5">
                {data.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-foreground">
                      {entry.action.replace(/_/g, ' ')}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {relativeTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
