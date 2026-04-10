'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Plus, Calculator } from 'lucide-react';
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
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { RegisterFilterBar } from '@/components/commercial/register-filter-bar';

const COST_PROPOSAL_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'returned',
  'approved_internal',
  'issued',
  'linked_to_variation',
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

export default function CostProposalsListPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [filters, setFilters] = useState({
    statusFilter: [] as string[],
    sortField: 'createdAt',
    sortDirection: 'desc' as const,
  });
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading } = trpc.commercial.costProposal.list.useQuery({
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
  } as Parameters<typeof trpc.commercial.costProposal.list.useQuery>[0]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cost Proposals"
        description="Manage cost proposals for this project"
        actions={
          <Button size="sm" disabled>
            <Plus className="h-4 w-4 mr-1" />
            Create Cost Proposal
          </Button>
        }
      />

      <RegisterFilterBar
        statuses={COST_PROPOSAL_STATUSES}
        filters={filters}
        onFilterChange={(f) => {
          setFilters(f);
          setPage(0);
        }}
      />

      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={Calculator}
          title="No cost proposals found"
          description="Create a cost proposal to get started."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference #</TableHead>
                <TableHead>Revision</TableHead>
                <TableHead className="text-right">Estimated Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((cp) => (
                <TableRow
                  key={cp.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/commercial/cost-proposals/${cp.id}`}
                      className="font-medium hover:underline"
                    >
                      {cp.referenceNumber ?? (
                        <span className="text-muted-foreground italic">
                          Draft
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {cp.revisionNumber != null ? `Rev ${cp.revisionNumber}` : '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(cp.estimatedCost)}
                  </TableCell>
                  <TableCell>
                    <CommercialStatusBadge status={cp.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(cp.createdAt).toLocaleDateString()}
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
