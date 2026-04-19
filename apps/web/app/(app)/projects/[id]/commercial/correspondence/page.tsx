'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Plus, Mail, ShieldOff } from 'lucide-react';
import { Button } from '@fmksa/ui/components/button';
import { Tabs, TabsList, TabsTrigger } from '@fmksa/ui/components/tabs';
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

const CORRESPONDENCE_STATUSES = [
  'draft',
  'under_review',
  'returned',
  'approved_internal',
  'signed',
  'issued',
  'rejected',
  'superseded',
  'closed',
  'response_due',
  'responded',
  'under_evaluation',
  'partially_accepted',
  'accepted',
  'disputed',
  'acknowledged',
  'recovered',
  'partially_recovered',
];

type SubtypeTab = 'all' | 'letter' | 'notice' | 'claim' | 'back_charge';

const SUBTYPE_LABELS: Record<string, string> = {
  letter: 'Letter',
  notice: 'Notice',
  claim: 'Claim',
  back_charge: 'Back Charge',
};

function SubtypeBadge({ subtype }: { subtype: string }) {
  return (
    <Badge variant="outline" className="capitalize text-xs whitespace-nowrap">
      {SUBTYPE_LABELS[subtype] ?? subtype}
    </Badge>
  );
}

export default function CorrespondenceListPage() {
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

  const { data, isLoading, error } = trpc.commercial.correspondence.list.useQuery({
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
  } as Parameters<typeof trpc.commercial.correspondence.list.useQuery>[0]);

  const recordIds = (data?.items ?? []).map((c) => c.id);
  const { data: workflowMap, isLoading: workflowLoading } =
    trpc.workflow.instances.listByRecords.useQuery(
      { recordType: 'correspondence', recordIds },
      { enabled: recordIds.length > 0 },
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Correspondence"
        description="Manage project correspondence, notices, claims, and back charges"
        actions={
          <Button size="sm" asChild>
            <Link href={`/projects/${projectId}/commercial/correspondence/create`}>
              <Plus className="h-4 w-4 mr-1" />
              Create Correspondence
            </Link>
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
          <TabsTrigger value="letter">Letter</TabsTrigger>
          <TabsTrigger value="notice">Notice</TabsTrigger>
          <TabsTrigger value="claim">Claim</TabsTrigger>
          <TabsTrigger value="back_charge">Back Charge</TabsTrigger>
        </TabsList>
      </Tabs>

      <RegisterFilterBar
        statuses={CORRESPONDENCE_STATUSES}
        filters={filters}
        onFilterChange={(f) => {
          setFilters(f);
          setPage(0);
        }}
        showAmountFilter={false}
      />

      {error?.data?.code === 'FORBIDDEN' ? (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">You don&apos;t have permission to view Correspondence in this project.</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-destructive">{error.message}</div>
      ) : isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={Mail}
          title="No correspondence found"
          description="Create a letter, notice, claim, or back charge to get started."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead variant="compact">Reference #</TableHead>
                <TableHead variant="compact">Subject</TableHead>
                <TableHead variant="compact">Subtype</TableHead>
                <TableHead variant="compact">Recipient</TableHead>
                <TableHead variant="compact">Status</TableHead>
                <TableHead variant="compact">Workflow</TableHead>
                <TableHead variant="compact">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((corr) => (
                <TableRow
                  key={corr.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/commercial/correspondence/${corr.id}`}
                      className="font-medium hover:underline whitespace-nowrap"
                    >
                      {corr.referenceNumber ?? (
                        <span className="text-muted-foreground italic">
                          {corr.status === 'draft' ? 'Draft' : 'No reference'}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">
                    {corr.subject}
                  </TableCell>
                  <TableCell>
                    <SubtypeBadge subtype={corr.subtype} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                    {corr.recipientName}
                  </TableCell>
                  <TableCell>
                    <CommercialStatusBadge status={corr.status} />
                  </TableCell>
                  <TableCell>
                    <WorkflowRegisterCell
                      instance={workflowMap?.[corr.id]}
                      recordStatus={corr.status}
                      isLoading={workflowLoading}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(corr.createdAt).toLocaleDateString()}
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
