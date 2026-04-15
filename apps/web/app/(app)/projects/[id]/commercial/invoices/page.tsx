'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Plus, Receipt, ShieldOff, Clock } from 'lucide-react';
import { Button } from '@fmksa/ui/components/button';
import { Badge } from '@fmksa/ui/components/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@fmksa/ui/components/table';
import { trpc } from '@/lib/trpc-client';
import { parseDrilldownStatuses, parseDrilldownOverdue } from '@/lib/parse-drilldown-params';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { RegisterFilterBar } from '@/components/commercial/register-filter-bar';

type FilterState = {
  statusFilter: string[];
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  createdByFilter?: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
};

const TAX_INVOICE_STATUSES = [
  'draft',
  'under_review',
  'returned',
  'approved_internal',
  'issued',
  'submitted',
  'partially_collected',
  'collected',
  'overdue',
  'cancelled',
  'superseded',
];

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

export default function TaxInvoiceListPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = params.id;

  // Overdue drilldown filter — consumed from KPI dashboard link
  const overdueOnly = parseDrilldownOverdue(searchParams);

  const [filters, setFilters] = useState<FilterState>(() => ({
    statusFilter: parseDrilldownStatuses(searchParams),
    sortField: 'createdAt',
    sortDirection: 'desc',
  }));
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading, error } = trpc.commercial.taxInvoice.list.useQuery({
    projectId,
    skip: page * pageSize,
    take: pageSize,
    sortField: filters.sortField,
    sortDirection: filters.sortDirection,
    ...(filters.statusFilter.length > 0
      ? { statusFilter: filters.statusFilter }
      : {}),
    ...(filters.dateFrom
      ? { dateFrom: new Date(filters.dateFrom).toISOString() }
      : {}),
    ...(filters.dateTo
      ? { dateTo: new Date(filters.dateTo).toISOString() }
      : {}),
    ...(filters.amountMin !== undefined
      ? { amountMin: filters.amountMin }
      : {}),
    ...(filters.amountMax !== undefined
      ? { amountMax: filters.amountMax }
      : {}),
    ...(overdueOnly ? { overdueOnly: true } : {}),
  } as Parameters<typeof trpc.commercial.taxInvoice.list.useQuery>[0]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tax Invoices"
        description="Manage tax invoices for this project"
        actions={
          <Link href={`/projects/${projectId}/commercial/invoices/create`}>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Create Invoice
            </Button>
          </Link>
        }
      />

      <RegisterFilterBar
        statuses={TAX_INVOICE_STATUSES}
        filters={filters}
        onFilterChange={(f) => {
          setFilters(f);
          setPage(0);
        }}
      >
        {overdueOnly && (
          <Badge variant="destructive" className="gap-1 text-xs">
            <Clock className="h-3 w-3" />
            Overdue only (past due date)
          </Badge>
        )}
      </RegisterFilterBar>

      {error?.data?.code === 'FORBIDDEN' ? (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">You don&apos;t have permission to view Tax Invoices in this project.</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-destructive">{error.message}</div>
      ) : isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={Receipt}
          title="No tax invoices found"
          description="Tax invoices are created against signed IPCs."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Reference #</TableHead>
                <TableHead className="text-right">Gross Amount</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((inv) => (
                <TableRow
                  key={inv.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/commercial/invoices/${inv.id}`}
                      className="font-medium hover:underline"
                    >
                      {inv.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.referenceNumber ?? (
                      <span className="italic">
                        {inv.status === 'draft' ? 'Draft' : 'No reference'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(inv.grossAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(inv.vatAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoney(inv.totalAmount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.dueDate
                      ? new Date(inv.dueDate).toLocaleDateString()
                      : <span className="italic">—</span>}
                  </TableCell>
                  <TableCell>
                    <CommercialStatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {data?.total ?? 0} total
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
            disabled={!data || (page + 1) * pageSize >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
