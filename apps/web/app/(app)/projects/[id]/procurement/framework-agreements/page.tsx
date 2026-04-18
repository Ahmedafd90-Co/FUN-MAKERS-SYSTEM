'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, FileCheck2, ShieldOff } from 'lucide-react';
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

export default function FrameworkAgreementsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Framework agreements are entity-scoped master data. We resolve the
  // project's entityId first, then query the agreements belonging to that
  // entity. Agreements with no projectId scope all projects under the entity.
  const { data: project } = trpc.projects.get.useQuery({
    id: projectId,
    projectId,
  });
  const entityId = project?.entity?.id;

  const { data, isLoading, error } = trpc.procurement.frameworkAgreement.list.useQuery(
    entityId
      ? {
          entityId,
          skip: page * pageSize,
          take: pageSize,
        }
      : (undefined as any),
    { enabled: !!entityId },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${projectId}/procurement`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Procurement
      </Link>

      <PageHeader
        title="Framework Agreements"
        description="Entity-level framework agreements available to this project."
      />

      {error?.data?.code === 'FORBIDDEN' ? (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to view framework agreements for this entity.
          </p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error.message}
        </div>
      ) : !entityId || isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : !items.length ? (
        <EmptyState
          icon={FileCheck2}
          title="No framework agreements"
          description="Framework agreements available to this entity will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agreement #</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Valid From</TableHead>
                <TableHead>Valid To</TableHead>
                <TableHead className="text-right">Committed Value</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((fa) => (
                <TableRow key={fa.id}>
                  <TableCell className="font-mono text-xs">
                    {fa.agreementNumber ?? '-'}
                  </TableCell>
                  <TableCell className="text-sm max-w-[240px] truncate">
                    {fa.title}
                  </TableCell>
                  <TableCell className="text-sm">{fa.vendor?.name ?? '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fa.validFrom
                      ? new Date(fa.validFrom).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fa.validTo ? new Date(fa.validTo).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {fa.totalCommittedValue != null
                      ? `${formatMoney(fa.totalCommittedValue)} ${fa.currency}`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fa.projectId === projectId
                      ? 'This project'
                      : fa.projectId
                        ? 'Other project'
                        : 'Entity-wide'}
                  </TableCell>
                  <TableCell>
                    <ProcurementStatusBadge status={fa.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{total} total</p>
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
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
