'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Wallet, ShieldOff } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@fmksa/ui/components/table';
import { trpc } from '@/lib/trpc-client';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';

function formatMoney(val: unknown): string {
  const num =
    typeof val === 'string'
      ? parseFloat(val)
      : typeof val === 'number'
        ? val
        : 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function KpiTile({
  label,
  value,
  currency,
  bold,
  destructive,
}: {
  label: string;
  value: number | null;
  currency: string;
  bold?: boolean;
  destructive?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </p>
      {value !== null ? (
        <p
          className={`text-sm font-mono tabular-nums leading-tight ${
            bold ? 'font-semibold' : ''
          } ${destructive ? 'text-destructive font-semibold' : ''}`}
        >
          {formatMoney(value)}
          <span className="text-[10px] text-muted-foreground font-normal ml-1">
            {currency}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground/50 italic">Not set</p>
      )}
    </div>
  );
}

export default function ProjectBudgetPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { data: project } = trpc.projects.get.useQuery({
    id: projectId,
    projectId,
  });
  const currency = project?.currency?.code ?? project?.currencyCode ?? '';

  const { data: summary, isLoading, error } = trpc.budget.summary.useQuery({
    projectId,
  });

  const { data: exceptions } = trpc.budget.openExceptions.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Project
      </Link>

      <PageHeader
        title="Project Budget"
        description="Read-only view of the internal delivery budget and line-level breakdown."
      />

      {error?.data?.code === 'FORBIDDEN' ? (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to view this project&apos;s budget.
          </p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error.message}
        </div>
      ) : isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : !summary ? (
        <EmptyState
          icon={Wallet}
          title="No internal budget configured"
          description="Set up the internal delivery budget on the project workspace to enable cost control."
        />
      ) : (
        <>
          {/* Summary KPIs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Budget Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
              <KpiTile
                label="Internal Baseline"
                value={summary.internalBaseline}
                currency={currency}
              />
              <KpiTile
                label="Internal Revised"
                value={summary.internalRevised}
                currency={currency}
              />
              <KpiTile
                label="Contingency"
                value={summary.contingencyAmount}
                currency={currency}
              />
              <KpiTile
                label="EI Reserve"
                value={summary.eiReserveTotal}
                currency={currency}
              />
              <KpiTile
                label="Total Budgeted"
                value={summary.totalBudgeted}
                currency={currency}
                bold
              />
              <KpiTile
                label="Committed"
                value={summary.totalCommitted}
                currency={currency}
              />
              <KpiTile
                label="Actual"
                value={summary.totalActual}
                currency={currency}
              />
              <KpiTile
                label="Remaining"
                value={summary.remainingBudget}
                currency={currency}
                bold
                destructive={summary.remainingBudget < 0}
              />
            </CardContent>
          </Card>

          {/* Open exceptions banner */}
          {exceptions && exceptions.length > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-destructive">
                  {exceptions.length} open absorption exception
                  {exceptions.length > 1 ? 's' : ''}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  One or more budget absorptions failed and are pending manual
                  resolution. Totals above may not reflect those amounts.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Budget lines */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Budget Lines ({summary.lines.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No budget lines configured.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Budget</TableHead>
                        <TableHead className="text-right">Committed</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.lines.map((line) => {
                        const remaining = line.remainingAmount;
                        const variance = line.varianceAmount;
                        return (
                          <TableRow key={line.id}>
                            <TableCell className="text-sm">
                              <span className="font-mono text-[11px] text-muted-foreground mr-2">
                                {line.categoryCode}
                              </span>
                              {line.categoryName}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">
                              {formatMoney(line.budgetAmount)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">
                              {formatMoney(line.committedAmount)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums text-sm">
                              {formatMoney(line.actualAmount)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono tabular-nums text-sm ${
                                remaining < 0 ? 'text-destructive' : ''
                              }`}
                            >
                              {formatMoney(remaining)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono tabular-nums text-sm ${
                                variance < 0 ? 'text-destructive' : ''
                              }`}
                            >
                              {formatMoney(variance)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-[11px] text-muted-foreground">
            To edit the budget baseline, revised amount, or line allocations,
            use the Budget tab on the{' '}
            <Link
              href={`/projects/${projectId}`}
              className="text-primary hover:underline"
            >
              project workspace
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
