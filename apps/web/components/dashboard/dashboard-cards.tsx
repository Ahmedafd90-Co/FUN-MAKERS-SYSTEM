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
// Human-readable activity label mapping
// ---------------------------------------------------------------------------

const ACTIVITY_LABELS: Record<string, string> = {
  'tax_invoice.transition.collection_partially_collected': 'Invoice partially collected',
  'tax_invoice.transition.collection_collected': 'Invoice fully collected',
  'invoice_collection.record': 'Collection recorded',
  'tax_invoice.create': 'Tax invoice created',
  'tax_invoice.transition.issue': 'Tax invoice issued',
  'tax_invoice.transition.submit': 'Tax invoice submitted',
  'ipc.create': 'IPC created',
  'ipc.transition.sign': 'IPC signed',
  'ipc.transition.approve_internal': 'IPC approved',
  'ipa.create': 'IPA created',
  'ipa.transition.approve_internal': 'IPA approved',
  'ipa.transition.submit': 'IPA submitted',
  'variation.create': 'Variation created',
  'variation.transition.approve_internal': 'Variation approved',
  'variation.transition.issue': 'Variation issued',
  'variation.transition.client_approve': 'Variation client approved',
  'cost_proposal.create': 'Cost proposal created',
  'cost_proposal.transition.approve_internal': 'Cost proposal approved',
  'correspondence.create': 'Correspondence created',
  'correspondence.transition.issue': 'Correspondence issued',
  'auth.sign_in': 'User signed in',
  'auth.sign_out': 'User signed out',
  'user.create': 'User created',
  'user.update': 'User updated',
  'project.create': 'Project created',
  'project.update': 'Project settings updated',
};

function humanizeAction(action: string): string {
  if (ACTIVITY_LABELS[action]) return ACTIVITY_LABELS[action];
  return action
    .replace(/\./g, ' \u203A ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
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
    refetchInterval: 60_000,
  });

  if (isLoading || !data) return <DashboardSkeleton />;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {/* Active Workflows — primary action card */}
      <Link href="/approvals" className="group">
        <Card className={`transition-all group-hover:shadow-md ${
          data.pendingApprovals > 0 ? 'border-l-2 border-l-amber-500' : ''
        }`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active Workflows
            </CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground/40" />
          </CardHeader>
          <CardContent>
            {data.pendingApprovals === 0 ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm text-muted-foreground">All clear</span>
              </div>
            ) : (
              <div>
                <p className="text-2xl font-bold tabular-nums">{data.pendingApprovals}</p>
                <p className="text-[11px] text-muted-foreground">awaiting action</p>
              </div>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* Notifications — secondary action card */}
      <Link href="/notifications" className="group">
        <Card className={`transition-all group-hover:shadow-md ${
          data.unreadNotifications > 0 ? 'border-l-2 border-l-blue-500' : ''
        }`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Notifications
            </CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground/40" />
          </CardHeader>
          <CardContent>
            {data.unreadNotifications === 0 ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm text-muted-foreground">All caught up</span>
              </div>
            ) : (
              <div>
                <p className="text-2xl font-bold tabular-nums">{data.unreadNotifications}</p>
                <p className="text-[11px] text-muted-foreground">unread</p>
              </div>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* My Projects — informational card */}
      <Link href="/projects" className="group">
        <Card className="transition-all group-hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              My Projects
            </CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground/40" />
          </CardHeader>
          <CardContent>
            {data.assignedProjects.length === 0 ? (
              <span className="text-sm text-muted-foreground">No projects assigned</span>
            ) : (
              <ul className="space-y-1">
                {data.assignedProjects.map((p) => {
                  const style = statusBadgeStyle(p.status);
                  return (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <Badge variant={style.variant} className={`${style.className ?? ''} h-4 px-1.5 text-[10px]`.trim()}>
                        {p.status}
                      </Badge>
                      <span className="truncate text-foreground/80">
                        {p.name}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </Link>

      {/* Recent Activity (admin only) — operational signal, not dev logs */}
      {data.isAdmin && (
        <Card className="bg-muted/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Recent Activity
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground/40" />
          </CardHeader>
          <CardContent>
            {data.recentActivity.length === 0 ? (
              <span className="text-sm text-muted-foreground">No recent activity</span>
            ) : (
              <ul className="space-y-2">
                {data.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-foreground/80">
                      {humanizeAction(entry.action)}
                    </span>
                    <span className="shrink-0 text-muted-foreground/60 font-mono tabular-nums text-[10px]">
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
