'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Plus, GitFork } from 'lucide-react';
import { Button } from '@fmksa/ui/components/button';
import { Tabs, TabsList, TabsTrigger } from '@fmksa/ui/components/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@fmksa/ui/components/table';
import { Badge } from '@fmksa/ui/components/badge';
import { trpc } from '@/lib/trpc-client';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { RegisterFilterBar } from '@/components/commercial/register-filter-bar';

const VARIATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'returned',
  'approved_internal',
  'signed',
  'issued',
  'client_pending',
  'client_approved',
  'client_rejected',
  'rejected',
  'superseded',
  'closed',
];

type SubtypeTab = 'all' | 'vo' | 'change_order';

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

function SubtypeBadge({ subtype }: { subtype: string }) {
  return (
    <Badge variant="outline" className="capitalize text-xs">
      {subtype === 'change_order' ? 'Change Order' : subtype.toUpperCase()}
    </Badge>
  );
}

export default function VariationsListPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [activeTab, setActiveTab] = useState<SubtypeTab>('all');
  const [filters, setFilters] = useState({
    statusFilter: [] as string[],
    sortField: 'createdAt',
    sortDirection: 'desc' as const,
  });
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading } = trpc.commercial.variation.list.useQuery({
    projectId,
    skip: page * pageSize,
    take: pageSize,
    sortField: filters.sortField,
    sortDirection: filters.sortDirection,
    ...(filters.statusFilter.length > 0
      ? { statusFilter: filters.statusFilter }
      : {}),
    ...(activeTab !== 'all' ? { subtypeFilter: activeTab } : {}),
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
  } as Parameters<typeof trpc.commercial.variation.list.useQuery>[0]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Variations"
        description="Manage variation orders and change orders for this project"
        actions={
          <Button size="sm" disabled>
            <Plus className="h-4 w-4 mr-1" />
            Create Variation
          </Button>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as SubtypeTab);
          setPage(0);
        }}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="vo">VO</TabsTrigger>
          <TabsTrigger value="change_order">Change Order</TabsTrigger>
        </TabsList>
      </Tabs>

      <RegisterFilterBar
        statuses={VARIATION_STATUSES}
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
          icon={GitFork}
          title="No variations found"
          description="Create a variation order to get started."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference #</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Subtype</TableHead>
                <TableHead className="text-right">Cost Impact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((variation) => (
                <TableRow
                  key={variation.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/commercial/variations/${variation.id}`}
                      className="font-medium hover:underline"
                    >
                      {variation.referenceNumber ?? (
                        <span className="text-muted-foreground italic">
                          Draft
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">
                    {variation.title}
                  </TableCell>
                  <TableCell>
                    <SubtypeBadge subtype={variation.subtype} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {variation.costImpact != null
                      ? formatMoney(variation.costImpact)
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <CommercialStatusBadge status={variation.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(variation.createdAt).toLocaleDateString()}
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
