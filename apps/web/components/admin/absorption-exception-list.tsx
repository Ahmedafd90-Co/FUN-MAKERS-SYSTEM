'use client';

/**
 * Cross-project absorption exception list — admin surface.
 *
 * Shows budget absorption failures across all projects with filters
 * by project, module, absorption type, severity, and status.
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
import { AlertTriangle, CheckCircle2, Clock, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';
import { statusBadgeStyle } from '@/lib/badge-variants';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSourceRecordHref(
  projectId: string,
  recordType: string,
  recordId: string,
): string | null {
  const base = `/projects/${projectId}`;
  switch (recordType) {
    case 'purchase_order':
      return `${base}/procurement/purchase-orders/${recordId}`;
    case 'supplier_invoice':
      return `${base}/procurement/supplier-invoices/${recordId}`;
    case 'expense':
      return `${base}/procurement/expenses/${recordId}`;
    case 'credit_note':
      return `${base}/procurement/credit-notes/${recordId}`;
    default:
      return null;
  }
}

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

const ABSORPTION_TYPE_LABELS: Record<string, string> = {
  po_commitment: 'PO Commitment',
  po_reversal: 'PO Reversal',
  si_actual: 'Supplier Invoice',
  expense_actual: 'Expense',
  cn_reversal: 'Credit Note',
  ei_reserve_increase: 'EI Reserve Increase',
  ei_reserve_release: 'EI Reserve Release',
};

const REASON_LABELS: Record<string, string> = {
  no_category: 'No matching category',
  no_budget: 'No budget exists',
  no_budget_category: 'Budget category missing',
  no_budget_line: 'Budget line missing',
};

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === 'error') {
    return <Badge variant="destructive" className="text-xs">Error</Badge>;
  }
  const style = statusBadgeStyle('pending');
  return (
    <Badge variant={style.variant} className={style.className + ' text-xs'}>
      Warning
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = statusBadgeStyle(status === 'resolved' ? 'resolved' : 'pending');
  if (status === 'resolved') {
    return <Badge variant={style.variant} className={style.className + ' text-xs'}>Resolved</Badge>;
  }
  return (
    <Badge variant={style.variant} className={style.className + ' text-xs'}>
      <AlertTriangle className="h-3 w-3 mr-1" />
      Open
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type AbsorptionExceptionListProps = {
  onSelectException: (id: string) => void;
};

export function AbsorptionExceptionList({
  onSelectException,
}: AbsorptionExceptionListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const take = 25;

  const queryInput = {
    status:
      statusFilter === 'open'
        ? ('open' as const)
        : statusFilter === 'resolved'
          ? ('resolved' as const)
          : undefined,
    severity: severityFilter !== 'all' ? severityFilter : undefined,
    sourceModule: moduleFilter !== 'all' ? moduleFilter : undefined,
    skip: page * take,
    take,
  };

  const { data, isLoading } = trpc.budget.allExceptions.useQuery(queryInput);

  const exceptions = data?.exceptions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / take);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Absorption Exceptions"
        description="Budget absorption failures across all projects. Open exceptions mean budget lines are not tracking committed or actual costs."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v); setPage(0); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            <SelectItem value="procurement">Procurement</SelectItem>
            <SelectItem value="engineer_instruction">Engineer Instruction</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {total} exception{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <p className="text-muted-foreground py-8 text-center">
          Loading exceptions...
        </p>
      )}

      {/* Empty state */}
      {!isLoading && exceptions.length === 0 && (
        <EmptyState
          icon={CheckCircle2}
          title="No absorption exceptions"
          description="All budget absorption operations completed successfully."
        />
      )}

      {/* Table */}
      {!isLoading && exceptions.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Project</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reason</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Severity</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Age</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
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
                      <div className="font-medium">{exc.project.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{exc.project.code}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="font-mono text-xs">
                        {ABSORPTION_TYPE_LABELS[exc.absorptionType] ?? exc.absorptionType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const href = buildSourceRecordHref(
                          exc.project.id,
                          exc.sourceRecordType,
                          exc.sourceRecordId,
                        );
                        return href ? (
                          <Link
                            href={href}
                            className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                          >
                            {exc.sourceRecordType}/{exc.sourceRecordId.slice(0, 8)}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {exc.sourceRecordType}/{exc.sourceRecordId.slice(0, 8)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs">
                        {REASON_LABELS[exc.reasonCode] ?? exc.reasonCode}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={exc.severity} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatAge(exc.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={exc.status} />
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
