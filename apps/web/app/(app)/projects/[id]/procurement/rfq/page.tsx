'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { FileSearch, Plus, ShieldOff } from 'lucide-react';
import { Button } from '@fmksa/ui/components/button';
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
import { ProcurementStatusBadge } from '@/components/procurement/procurement-status-badge';
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

const RFQ_STATUSES = [
  'draft',
  'under_review',
  'returned',
  'approved_internal',
  'issued',
  'responses_received',
  'evaluation',
  'awarded',
  'rejected',
  'cancelled',
  'closed',
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

export default function RfqListPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = params.id;

  // Real permissions — gate Create button (Stabilization Slice C)
  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();
  const canCreate = (userPermissions ?? []).includes('rfq.create');

  const [filters, setFilters] = useState<FilterState>(() => ({
    statusFilter: searchParams.getAll('status'),
    sortField: 'createdAt',
    sortDirection: 'desc',
  }));
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading, error } = trpc.procurement.rfq.list.useQuery({
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
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Requests for Quotation"
        description="Manage RFQs for this project"
        actions={
          canCreate ? (
            <Button size="sm" asChild>
              <Link href={`/projects/${projectId}/procurement/rfq/new`}>
                <Plus className="h-4 w-4 mr-1" />
                Create RFQ
              </Link>
            </Button>
          ) : undefined
        }
      />

      <RegisterFilterBar
        statuses={RFQ_STATUSES}
        filters={filters}
        onFilterChange={(f) => {
          setFilters(f);
          setPage(0);
        }}
      />

      {error?.data?.code === 'FORBIDDEN' ? (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to view RFQs in this project.
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
      ) : !data?.items.length ? (
        <EmptyState
          icon={FileSearch}
          title="No RFQs found"
          description="RFQs will appear here once created."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead variant="compact">RFQ #</TableHead>
                <TableHead variant="compact">Title</TableHead>
                <TableHead variant="compact" className="text-right">Vendors</TableHead>
                <TableHead variant="compact" className="text-right">Est. Budget</TableHead>
                <TableHead variant="compact">Status</TableHead>
                <TableHead variant="compact">Required By</TableHead>
                <TableHead variant="compact">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((rfq) => (
                <TableRow
                  key={rfq.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/procurement/rfq/${rfq.id}`}
                      className="font-medium hover:underline"
                    >
                      {rfq.referenceNumber ?? rfq.rfqNumber ?? (
                        <span className="text-muted-foreground italic">
                          {rfq.status === 'draft' ? 'Draft' : 'No reference'}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm max-w-[250px] truncate">
                    {rfq.title}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {rfq.rfqVendors?.length ?? 0}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {rfq.estimatedBudget != null
                      ? `${formatMoney(rfq.estimatedBudget)} ${rfq.currency}`
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <ProcurementStatusBadge status={rfq.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {rfq.requiredByDate
                      ? new Date(rfq.requiredByDate).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(rfq.createdAt).toLocaleDateString()}
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
