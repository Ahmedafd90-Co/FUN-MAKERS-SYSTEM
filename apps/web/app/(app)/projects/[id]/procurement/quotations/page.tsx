'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BarChart3, Plus, ShieldOff } from 'lucide-react';
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

export default function QuotationListPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  // Real permissions — gate Record button (Stabilization Slice C)
  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();
  const canCreate = (userPermissions ?? []).includes('quotation.create');

  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, isLoading, error } = trpc.procurement.quotation.list.useQuery({
    projectId,
    skip: page * pageSize,
    take: pageSize,
    sortDirection: 'desc',
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quotations"
        description="All vendor quotations for this project"
        actions={
          canCreate ? (
            <Button size="sm" asChild>
              <Link href={`/projects/${projectId}/procurement/quotations/new`}>
                <Plus className="h-4 w-4 mr-1" />
                Record Quotation
              </Link>
            </Button>
          ) : undefined
        }
      />

      {error?.data?.code === 'FORBIDDEN' ? (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to view quotations in this project.
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
          icon={BarChart3}
          title="No quotations found"
          description="Quotations will appear here once vendors respond to RFQs."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>RFQ</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((q) => (
                <TableRow
                  key={q.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/procurement/quotations/${q.id}`}
                      className="font-medium hover:underline"
                    >
                      {q.vendor?.name ?? 'Unknown Vendor'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {q.rfq?.referenceNumber ?? q.rfq?.rfqNumber ?? '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatMoney(q.totalAmount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {q.currency}
                  </TableCell>
                  <TableCell>
                    <ProcurementStatusBadge status={q.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {q.validUntil
                      ? new Date(q.validUntil).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(q.receivedDate).toLocaleDateString()}
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
