'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Plus, FileText, ShieldOff } from 'lucide-react';
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
import { parseDrilldownStatuses } from '@/lib/parse-drilldown-params';
import { ExportMenu } from '@/components/common/export-menu';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { RegisterFilterBar } from '@/components/commercial/register-filter-bar';
import { ForecastThisPeriodStrip } from '@/components/commercial/forecast-this-period-strip';

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

const IPA_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'returned',
  'approved_internal',
  'signed',
  'issued',
  'rejected',
  'superseded',
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

export default function IpaListPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = params.id;

  const [filters, setFilters] = useState<FilterState>(() => ({
    statusFilter: parseDrilldownStatuses(searchParams),
    sortField: 'createdAt',
    sortDirection: 'desc',
  }));
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading, error } = trpc.commercial.ipa.list.useQuery({
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
  } as Parameters<typeof trpc.commercial.ipa.list.useQuery>[0]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Interim Payment Applications"
        description="Manage IPA records for this project"
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu
              endpoint="/api/exports/ipa"
              query={{ projectId }}
              label="Export"
            />
            <Link href={`/projects/${projectId}/commercial/ipa/create`}>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Create IPA
              </Button>
            </Link>
          </div>
        }
      />

      <ForecastThisPeriodStrip projectId={projectId} />

      <RegisterFilterBar
        statuses={IPA_STATUSES}
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
          <p className="text-xs text-muted-foreground">You don&apos;t have permission to view IPAs in this project.</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-destructive">{error.message}</div>
      ) : isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={FileText}
          title="No IPAs found"
          description="Create an IPA to get started."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference #</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Gross Amount</TableHead>
                <TableHead className="text-right">Net Claimed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((ipa) => (
                <TableRow
                  key={ipa.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/commercial/ipa/${ipa.id}`}
                      className="font-medium hover:underline"
                    >
                      {ipa.referenceNumber ?? (
                        <span className="text-muted-foreground italic">
                          {ipa.status === 'draft' ? 'Draft' : 'No reference'}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {ipa.periodNumber != null ? `Period ${ipa.periodNumber}` : '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(ipa.grossAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(ipa.netClaimed)}
                  </TableCell>
                  <TableCell>
                    <CommercialStatusBadge status={ipa.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(ipa.createdAt).toLocaleDateString()}
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
