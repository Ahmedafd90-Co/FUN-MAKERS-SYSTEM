'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';
import { Badge } from '@fmksa/ui/components/badge';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  FileText, FileBadge, GitBranch, Calculator, Receipt, Mail,
  TrendingDown, TrendingUp, Minus
} from 'lucide-react';

import { trpc } from '@/lib/trpc-client';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0.00';
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function VarianceCard({ title, submitted, approved, reduction, percent }: {
  title: string;
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
          <span className="text-muted-foreground">Submitted</span>
          <span className="font-mono">{formatCurrency(submitted)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Approved</span>
          <span className="font-mono">{formatCurrency(approved)}</span>
        </div>
        <div className={`flex items-center justify-between text-xs font-medium ${isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-muted-foreground'}`}>
          <span className="flex items-center gap-1">
            {isPositive ? <TrendingDown className="h-3 w-3" /> : isNegative ? <TrendingUp className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            Reduction
          </span>
          <span className="font-mono">{formatCurrency(reduction)} ({percent.toFixed(1)}%)</span>
        </div>
      </CardContent>
    </Card>
  );
}

const MODEL_ICONS: Record<string, { icon: typeof FileText; label: string; href: string }> = {
  ipa: { icon: FileText, label: 'IPA', href: 'ipa' },
  ipc: { icon: FileBadge, label: 'IPC', href: 'ipc' },
  variation: { icon: GitBranch, label: 'Variations', href: 'variations' },
  costProposal: { icon: Calculator, label: 'Cost Proposals', href: 'cost-proposals' },
  taxInvoice: { icon: Receipt, label: 'Tax Invoices', href: 'invoices' },
  correspondence: { icon: Mail, label: 'Correspondence', href: 'correspondence' },
};

export function DashboardCards({ projectId }: { projectId: string }) {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = trpc.commercial.dashboard.summary.useQuery({ projectId });

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2"><div className="h-4 w-20 bg-muted rounded" /></CardHeader>
            <CardContent><div className="h-8 w-12 bg-muted rounded" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  if (!data) return null;

  const basePath = `/projects/${params.id}/commercial`;

  return (
    <div className="space-y-6">
      {/* Register Summary */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Register Summary</h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(data.registerSummary).map(([key, val]) => {
            const meta = MODEL_ICONS[key];
            if (!meta) return null;
            const Icon = meta.icon;
            const summary = val as { total: number; byStatus: Record<string, number> };
            return (
              <Card key={key}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{meta.label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.total}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(summary.byStatus).map(([status, count]) => (
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
      </div>

      {/* Financial Summary */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Financial Summary</h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total Claimed', value: data.financialSummary.totalClaimed },
            { label: 'Total Certified', value: data.financialSummary.totalCertified },
            { label: 'Total Invoiced', value: data.financialSummary.totalInvoiced },
            { label: 'Variation Exposure', value: data.financialSummary.totalVariationExposure },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold font-mono">{formatCurrency(value)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Variance Analytics */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Variance Analytics</h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <VarianceCard
            title="IPA vs IPC"
            submitted={data.varianceAnalytics.ipaVariance.totalSubmitted}
            approved={data.varianceAnalytics.ipaVariance.totalCertified}
            reduction={data.varianceAnalytics.ipaVariance.reductionAmount}
            percent={data.varianceAnalytics.ipaVariance.reductionPercent}
          />
          <VarianceCard
            title="Variation"
            submitted={data.varianceAnalytics.variationVariance.totalSubmitted}
            approved={data.varianceAnalytics.variationVariance.totalApproved}
            reduction={data.varianceAnalytics.variationVariance.reductionAmount}
            percent={data.varianceAnalytics.variationVariance.reductionPercent}
          />
          <VarianceCard
            title="Cost Proposal"
            submitted={data.varianceAnalytics.costProposalVariance.totalEstimated}
            approved={data.varianceAnalytics.costProposalVariance.totalApproved}
            reduction={data.varianceAnalytics.costProposalVariance.reductionAmount}
            percent={data.varianceAnalytics.costProposalVariance.reductionPercent}
          />
        </div>
      </div>

      {/* Recent Activity */}
      {data.recentActivity.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent Activity</h3>
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {data.recentActivity.map((entry: any) => (
                  <div key={entry.id} className="flex items-start justify-between text-sm">
                    <span className="capitalize">{entry.action.replace(/\./g, ' > ').replace(/_/g, ' ')}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
