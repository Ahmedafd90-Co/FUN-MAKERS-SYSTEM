'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Plus, GitFork, ShieldOff } from 'lucide-react';
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
import { parseDrilldownStatuses } from '@/lib/parse-drilldown-params';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { RegisterFilterBar } from '@/components/commercial/register-filter-bar';
import { WorkflowRegisterCell } from '@/components/workflow/workflow-register-cell';

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
  const searchParams = useSearchParams();
  const projectId = params.id;

  const [activeTab, setActiveTab] = useState<SubtypeTab>('all');
  const [filters, setFilters] = useState<FilterState>(() => ({
    statusFilter: parseDrilldownStatuses(searchParams),
    sortField: 'createdAt',
    sortDirection: 'desc',
  }));
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading, error } = trpc.commercial.variation.list.useQuery({
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

  const recordIds = (data?.items ?? []).map((v) => v.id);
  const { data: workflowMap, isLoading: workflowLoading } =
    trpc.workflow.instances.listByRecords.useQuery(
      { recordType: 'variation', recordIds },
      { enabled: recordIds.length > 0 },
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Variations"
        description="Manage variation orders and change orders for this project"
        actions={
          <Link href={`/projects/${projectId}/commercial/variations/create`}>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Create Variation
            </Button>
          </Link>
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

      {error?.data?.code === 'FORBIDDEN' ? (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">You don&apos;t have permission to view Variations in this project.</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-destructive">{error.message}</div>
      ) : isLoading ? (
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
                <TableHead variant="compact">Reference #</TableHead>
                <TableHead variant="compact">Title</TableHead>
                <TableHead variant="compact">Subtype</TableHead>
                <TableHead variant="compact" className="text-right">Cost Impact</TableHead>
                <TableHead variant="compact">Status</TableHead>
                <TableHead variant="compact">Workflow</TableHead>
                <TableHead variant="compact">Created</TableHead>
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
                          {variation.status === 'draft' ? 'Draft' : 'No reference'}
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
                  <TableCell>
                    <WorkflowRegisterCell
                      instance={workflowMap?.[variation.id]}
                      recordStatus={variation.status}
                      isLoading={workflowLoading}
                    />
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
