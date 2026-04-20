'use client';

/**
 * Dashboard composition for /home.
 *
 * Layout (12-col at lg, stacks at md/sm):
 *
 *   ┌─ Greeting band ───────────────────────────────────────┐
 *   │                                                        │
 *   ├─ Priority zone ────────────────────────┬─ Feature ────┤
 *   │ KPI · KPI · (KPI)                      │ block        │
 *   ├─ Portfolio (cols 1-7) ─────────────────┴─ Activity ──┤
 *   ├─ Commercial signals ─────────────┬─ Procurement ─────┤
 *   └────────────────────────────────────────────────────────┘
 *
 * Role awareness is light:
 *   - Admin sees a third KPI card for posting exceptions
 *   - Admin sees the Activity stream populated; non-admin sees the
 *     same column but rendered as a quiet empty state
 *
 * The feature block is context-aware:
 *   - Pending approvals > 0 → urges action with orange accent
 *   - Quiet state otherwise → "Welcome back" with teal accent
 */
import {
  ClipboardCheck,
  Bell,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@fmksa/ui/components/card';

import { trpc } from '@/lib/trpc-client';

import { GreetingBand } from './greeting-band';
import { KpiCard } from './kpi-card';
import { FeatureBlock } from './feature-block';
import { SummaryModule } from './summary-module';
import { SignalRow } from './signal-row';
import { PortfolioList } from './portfolio-list';
import { ActivityStream } from './activity-stream';
import { WorkflowBand } from './workflow-band';

type DashboardCardsProps = {
  /** First name / display name from server-side session. Avoids a client
   *  round-trip just to greet the user. */
  userName: string;
};

// ---------------------------------------------------------------------------
// Skeleton — honest placeholder while the summary loads.
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-72 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="lg:col-span-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="h-5 w-48 animate-pulse rounded bg-muted/70" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted/60" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function DashboardCards({ userName }: DashboardCardsProps) {
  const { data, isLoading } = trpc.dashboard.summary.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  if (isLoading || !data) return <DashboardSkeleton />;

  const {
    pendingApprovals,
    unreadNotifications,
    assignedProjects,
    recentActivity,
    isAdmin,
    commercialSignals,
    procurementSignals,
    adminSignals,
    workflowBand,
  } = data;

  // Feature-block context — surfaces the single most important thing.
  const featureBlock =
    pendingApprovals > 0
      ? {
          tone: 'orange' as const,
          eyebrow: 'Action needed',
          title: `${pendingApprovals} ${pendingApprovals === 1 ? 'approval' : 'approvals'} waiting on you`,
          description:
            'Records sit in your queue waiting for a decision. Open the queue to triage by project and lifecycle.',
          action: { label: 'Open my approvals', href: '/approvals' },
        }
      : isAdmin && (adminSignals?.postingExceptionsOpen ?? 0) > 0
        ? {
            tone: 'orange' as const,
            eyebrow: 'Operations attention',
            title: `${adminSignals!.postingExceptionsOpen} posting ${adminSignals!.postingExceptionsOpen === 1 ? 'exception' : 'exceptions'} open`,
            description:
              'Ledger postings paused on these records. Resolve to release them back into the operational flow.',
            action: { label: 'Open posting exceptions', href: '/admin/posting-exceptions' },
          }
        : {
            tone: 'quiet' as const,
            eyebrow: 'All clear',
            title: 'Your operations queue is clean.',
            description:
              'No approvals waiting, no operational exceptions to resolve. Use the quick links below to keep things moving.',
            action: { label: 'Browse projects', href: '/projects' },
          };

  return (
    <div className="space-y-6">
      <GreetingBand
        userName={userName}
        pendingApprovals={pendingApprovals}
        unreadNotifications={unreadNotifications}
      />

      {/* Priority + feature row */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-12">
        <div
          className={`grid gap-4 grid-cols-1 sm:grid-cols-2 ${
            isAdmin ? 'lg:col-span-8 lg:grid-cols-3' : 'lg:col-span-8 lg:grid-cols-2'
          }`}
        >
          <KpiCard
            label="My approvals"
            count={pendingApprovals}
            subLabel={pendingApprovals === 1 ? 'awaiting decision' : 'awaiting decisions'}
            icon={ClipboardCheck}
            href="/approvals"
            tone="urgent"
            zeroLabel="Queue clear"
          />
          <KpiCard
            label="Notifications"
            count={unreadNotifications}
            subLabel={unreadNotifications === 1 ? 'unread message' : 'unread messages'}
            icon={Bell}
            href="/notifications"
            zeroLabel="All caught up"
          />
          {isAdmin && (
            <KpiCard
              label="Posting exceptions"
              count={adminSignals?.postingExceptionsOpen ?? 0}
              subLabel={
                (adminSignals?.postingExceptionsOpen ?? 0) === 1
                  ? 'awaiting resolution'
                  : 'awaiting resolution'
              }
              icon={AlertTriangle}
              href="/admin/posting-exceptions"
              tone="urgent"
              zeroLabel="No open exceptions"
            />
          )}
        </div>
        <div className="lg:col-span-4">
          <FeatureBlock {...featureBlock} />
        </div>
      </div>

      {/* Workflow band — operational workflow visibility (W4) */}
      <WorkflowBand data={workflowBand} />

      {/* Portfolio + Activity row */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <SummaryModule
            eyebrow="Portfolio"
            title="My projects"
            helper={
              assignedProjects.length === 0
                ? undefined
                : `${assignedProjects.length} most recent`
            }
            footerLink={{ label: 'View all projects', href: '/projects' }}
          >
            <PortfolioList projects={assignedProjects} />
          </SummaryModule>
        </div>
        <div className="lg:col-span-4">
          <SummaryModule
            eyebrow="Recent"
            title="Activity"
            helper={isAdmin ? undefined : 'Visible to admins only.'}
            footerLink={
              isAdmin ? { label: 'Open audit log', href: '/admin/audit-log' } : undefined
            }
          >
            <ActivityStream entries={recentActivity} />
          </SummaryModule>
        </div>
      </div>

      {/* Signals row — commercial + procurement pressure */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <SummaryModule
          eyebrow="Commercial"
          title="What needs attention"
          helper="Records in your assigned projects that are mid-lifecycle."
        >
          <div>
            <SignalRow
              label="IPCs in review"
              count={commercialSignals.ipcInReview}
              href="/projects"
            />
            <SignalRow
              label="Variations open"
              count={commercialSignals.variationsOpen}
              href="/projects"
            />
            <SignalRow
              label="Tax invoices overdue"
              count={commercialSignals.taxInvoicesOverdue}
              href="/projects"
            />
            <SignalRow
              label="Cost proposals open"
              count={commercialSignals.costProposalsOpen}
              href="/projects"
            />
          </div>
        </SummaryModule>

        <SummaryModule
          eyebrow="Procurement"
          title="Pressure points"
          helper="Records flagged for procurement attention across your projects."
        >
          <div>
            <SignalRow
              label="POs awaiting approval"
              count={procurementSignals.posAwaitingApproval}
              href="/projects"
            />
            <SignalRow
              label="Supplier invoices disputed"
              count={procurementSignals.supplierInvoicesDisputed}
              href="/projects"
            />
            <SignalRow
              label="Expenses pending action"
              count={procurementSignals.expensesPendingAction}
              href="/projects"
            />
            <SignalRow
              label="Credit notes to verify"
              count={procurementSignals.creditNotesReceived}
              href="/projects"
            />
          </div>
        </SummaryModule>
      </div>
    </div>
  );
}
