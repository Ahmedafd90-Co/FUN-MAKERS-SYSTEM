'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';
import { Badge } from '@fmksa/ui/components/badge';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  FileText, FileBadge, GitBranch, Calculator, Receipt, Mail,
  TrendingDown, TrendingUp, Minus, ArrowRight, AlertTriangle,
} from 'lucide-react';

import { trpc } from '@/lib/trpc-client';
import { DASHBOARD_DISPLAY_IDS, PERCENTAGE_KPI_IDS } from '@fmksa/core/commercial/dashboard/kpi-definitions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0.00';
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0.00%';
  return `${num.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// KPI display configuration
// ---------------------------------------------------------------------------

const LABEL_OVERRIDES: Record<string, string> = {
  budget: 'Contract Value',
  revised_budget: 'Revised Contract Value',
};

// ---------------------------------------------------------------------------
// KPI tier classification — drives visual hierarchy
// ---------------------------------------------------------------------------

type KpiTier = 'risk' | 'core' | 'reference';

const KPI_TIERS: Record<string, KpiTier> = {
  overdue_receivable: 'risk',
  open_receivable: 'risk',
  claimed_vs_certified_gap: 'risk',
  total_claimed: 'core',
  total_certified: 'core',
  total_invoiced: 'core',
  total_collected: 'core',
  collection_rate: 'reference',
  budget: 'reference',
  revised_budget: 'reference',
  submitted_variation_impact: 'reference',
  approved_variation_impact: 'reference',
};

function getKpiTier(kpiId: string): KpiTier {
  return KPI_TIERS[kpiId] ?? 'reference';
}

// ---------------------------------------------------------------------------
// Activity label mapping — converts raw audit actions to readable text
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
  'ipc.transition.approve_internal': 'IPC approved internally',
  'ipa.create': 'IPA created',
  'ipa.transition.approve_internal': 'IPA approved internally',
  'ipa.transition.submit': 'IPA submitted',
  'variation.create': 'Variation created',
  'variation.transition.approve_internal': 'Variation approved internally',
  'variation.transition.issue': 'Variation issued',
  'variation.transition.client_approve': 'Variation client approved',
  'cost_proposal.create': 'Cost proposal created',
  'cost_proposal.transition.approve_internal': 'Cost proposal approved internally',
  'correspondence.create': 'Correspondence created',
  'correspondence.transition.issue': 'Correspondence issued',
  'auth.sign_in': 'User signed in',
  'auth.sign_out': 'User signed out',
  'user.create': 'User created',
  'user.update': 'User updated',
  'project.create': 'Project created',
  'project.update': 'Project updated',
};

function humanizeAction(action: string): string {
  if (ACTIVITY_LABELS[action]) return ACTIVITY_LABELS[action];
  // Fallback: convert dot.underscore format to readable text
  return action
    .replace(/\./g, ' \u203A ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Drilldown helpers
// ---------------------------------------------------------------------------

interface DrilldownTarget {
  page: string;
  statusFilter: string[];
  additionalFilters?: Record<string, string>;
}

function buildDrilldownHref(target: DrilldownTarget, projectId: string): string {
  const href = target.page.replace('[id]', projectId);
  const params = new URLSearchParams();
  if (target.statusFilter?.length) {
    params.set('status', target.statusFilter.join(','));
  }
  if (target.additionalFilters) {
    for (const [k, v] of Object.entries(target.additionalFilters)) {
      params.set(k, v);
    }
  }
  const qs = params.toString();
  return qs ? `${href}?${qs}` : href;
}

function drilldownPageLabel(page: string): string {
  if (page.includes('/ipa')) return 'IPA Register';
  if (page.includes('/ipc')) return 'IPC Register';
  if (page.includes('/invoices')) return 'Invoices';
  if (page.includes('/variations')) return 'Variations';
  return 'Details';
}

// ---------------------------------------------------------------------------
// KPI Card — tiered visual hierarchy
// ---------------------------------------------------------------------------

function KpiCard({
  kpi,
  projectId,
}: {
  kpi: {
    id: string;
    name: string;
    value: string | null;
    supportStatus: string;
    drilldown: DrilldownTarget | DrilldownTarget[] | null;
  };
  projectId: string;
}) {
  if (kpi.supportStatus !== 'supported') return null;

  const label = LABEL_OVERRIDES[kpi.id] ?? kpi.name;
  const tier = getKpiTier(kpi.id);

  // Not-set state
  if (kpi.value === null) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-1.5">
          <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground/40 italic">Not set</p>
        </CardContent>
      </Card>
    );
  }

  const isPercent = PERCENTAGE_KPI_IDS.has(kpi.id);
  const formattedValue = isPercent ? formatPercent(kpi.value) : formatCurrency(kpi.value);
  const numValue = parseFloat(kpi.value) || 0;
  const isCrossRecord = Array.isArray(kpi.drilldown);

  // Tier-specific styling
  const isRiskWithValue = tier === 'risk' && numValue > 0;
  const isOverdue = kpi.id === 'overdue_receivable' && numValue > 0;

  const cardClasses = [
    // Risk tier: left border accent
    tier === 'risk' && numValue > 0 && 'border-l-2',
    isOverdue && 'border-l-red-500 bg-red-50/30 dark:bg-red-950/10',
    tier === 'risk' && !isOverdue && numValue > 0 && 'border-l-amber-500 bg-amber-50/20 dark:bg-amber-950/10',
    // Reference tier: subtler
    tier === 'reference' && 'bg-muted/20',
  ].filter(Boolean).join(' ');

  const valueClasses = [
    'font-mono tabular-nums',
    tier === 'risk' && numValue > 0 && 'text-xl font-bold',
    tier === 'core' && 'text-lg font-bold',
    tier === 'reference' && 'text-base font-semibold text-foreground/80',
    isOverdue && 'text-destructive',
  ].filter(Boolean).join(' ');

  // Cross-record KPIs (e.g. claimed_vs_certified_gap)
  if (isCrossRecord && kpi.drilldown) {
    const targets = kpi.drilldown as DrilldownTarget[];
    return (
      <Card className={cardClasses}>
        <CardHeader className="pb-1.5">
          <div className="flex items-center gap-1.5">
            {isRiskWithValue && <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />}
            <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className={valueClasses}>{formattedValue}</p>
          <div className="mt-2.5 flex items-center gap-3">
            {targets.map((target, i) => (
              <Link
                key={i}
                href={buildDrilldownHref(target, projectId)}
                className={`inline-flex items-center gap-0.5 text-[10px] underline-offset-2 hover:underline transition-colors ${
                  i === 0
                    ? 'text-foreground/70 font-medium hover:text-foreground'
                    : 'text-muted-foreground/50 hover:text-muted-foreground'
                }`}
              >
                {drilldownPageLabel(target.page)}
                <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Single-drilldown KPIs
  const singleTarget = kpi.drilldown as DrilldownTarget | null;
  const href = singleTarget ? buildDrilldownHref(singleTarget, projectId) : null;

  const card = (
    <Card className={`${cardClasses} ${href ? 'transition-all hover:shadow-sm hover:border-foreground/20 cursor-pointer' : ''}`}>
      <CardHeader className="pb-1.5">
        <div className="flex items-center gap-1.5">
          {isOverdue && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
          <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className={valueClasses}>{formattedValue}</p>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href} className="block">{card}</Link> : card;
}

// ---------------------------------------------------------------------------
// Variance Card
// ---------------------------------------------------------------------------

function VarianceCard({
  title,
  submittedLabel,
  approvedLabel,
  reductionLabel,
  submitted,
  approved,
  reduction,
  percent,
}: {
  title: string;
  submittedLabel: string;
  approvedLabel: string;
  reductionLabel: string;
  submitted: string;
  approved: string;
  reduction: string;
  percent: number;
}) {
  const reductionNum = parseFloat(reduction);
  const isPositive = reductionNum > 0;
  const isNegative = reductionNum < 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{submittedLabel}</span>
          <span className="font-mono tabular-nums">{formatCurrency(submitted)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{approvedLabel}</span>
          <span className="font-mono tabular-nums">{formatCurrency(approved)}</span>
        </div>
        <div className={`flex items-center justify-between text-xs font-medium ${isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-muted-foreground'}`}>
          <span className="flex items-center gap-1">
            {isPositive ? <TrendingDown className="h-3 w-3" /> : isNegative ? <TrendingUp className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {reductionLabel}
          </span>
          <span className="font-mono tabular-nums">{formatCurrency(reduction)} ({percent.toFixed(1)}%)</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Register model icons
// ---------------------------------------------------------------------------

const MODEL_ICONS: Record<string, { icon: typeof FileText; label: string; href: string }> = {
  ipa: { icon: FileText, label: 'IPA', href: 'ipa' },
  ipc: { icon: FileBadge, label: 'IPC', href: 'ipc' },
  variation: { icon: GitBranch, label: 'Variations', href: 'variations' },
  costProposal: { icon: Calculator, label: 'Cost Proposals', href: 'cost-proposals' },
  taxInvoice: { icon: Receipt, label: 'Tax Invoices', href: 'invoices' },
  correspondence: { icon: Mail, label: 'Correspondence', href: 'correspondence' },
};

// ---------------------------------------------------------------------------
// Dashboard Cards — main component
// ---------------------------------------------------------------------------

export function DashboardCards({ projectId }: { projectId: string }) {
  const params = useParams<{ id: string }>();

  const summary = trpc.commercial.dashboard.summary.useQuery({ projectId });
  const kpis = trpc.commercial.dashboard.financialKpis.useQuery({ projectId });

  const isLoading = summary.isLoading || kpis.isLoading;
  const error = summary.error || kpis.error;

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={`reg-${i}`} className="animate-pulse">
              <CardHeader className="pb-2"><div className="h-4 w-20 bg-muted rounded" /></CardHeader>
              <CardContent><div className="h-8 w-12 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={`kpi-${i}`} className="animate-pulse">
              <CardHeader className="pb-2"><div className="h-3 w-24 bg-muted rounded" /></CardHeader>
              <CardContent><div className="h-6 w-16 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  if (!summary.data || !kpis.data) return null;

  const basePath = `/projects/${params.id}/commercial`;

  return (
    <div className="space-y-8">
      {/* --------------------------------------------------------------- */}
      {/* Financial Summary — primary control surface (renders first)     */}
      {/* --------------------------------------------------------------- */}
      <section>
        <div className="flex items-baseline gap-2 mb-4 pb-2 border-b">
          <h3 className="text-sm font-semibold text-foreground">
            Financial Summary
          </h3>
          <span className="text-xs text-muted-foreground">
            {kpis.data.currency}
          </span>
        </div>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {DASHBOARD_DISPLAY_IDS.map((kpiId) => {
            const kpi = kpis.data!.kpis[kpiId];
            if (!kpi) return null;
            return (
              <KpiCard
                key={kpiId}
                kpi={kpi}
                projectId={params.id}
              />
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Register Summary — secondary reference section                  */}
      {/* --------------------------------------------------------------- */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Register Summary
        </h3>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summary.data.registerSummary).map(([key, val]) => {
            const meta = MODEL_ICONS[key];
            if (!meta) return null;
            const Icon = meta.icon;
            const s = val as { total: number; byStatus: Record<string, number> };
            return (
              <Card key={key} className="bg-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{meta.label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground/40" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{s.total}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(s.byStatus).map(([status, count]) => (
                      <Link key={status} href={`${basePath}/${meta.href}?status=${status}`}>
                        <Badge variant="outline" className="text-[10px] capitalize cursor-pointer hover:bg-muted">
                          {status.replace(/_/g, ' ')}: {count}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Cost Proposal Analytics                                         */}
      {/* --------------------------------------------------------------- */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Cost Proposal Analytics
        </h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <VarianceCard
            title="Cost Proposal"
            submittedLabel="Estimated Cost"
            approvedLabel="Approved Cost"
            reductionLabel="Cost Reduction"
            submitted={summary.data.varianceAnalytics.costProposalVariance.totalEstimated}
            approved={summary.data.varianceAnalytics.costProposalVariance.totalApproved}
            reduction={summary.data.varianceAnalytics.costProposalVariance.reductionAmount}
            percent={summary.data.varianceAnalytics.costProposalVariance.reductionPercent}
          />
        </div>
      </section>

      {/* --------------------------------------------------------------- */}
      {/* Recent Activity — human-readable labels                         */}
      {/* --------------------------------------------------------------- */}
      {summary.data.recentActivity.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Recent Activity
          </h3>
          <Card className="bg-muted/20">
            <CardContent className="pt-4">
              <div className="space-y-2.5">
                {summary.data.recentActivity.map((entry: any) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground/80 truncate">
                      {humanizeAction(entry.action)}
                    </span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap font-mono tabular-nums">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
