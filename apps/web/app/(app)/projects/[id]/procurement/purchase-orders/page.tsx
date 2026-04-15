'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FileText, Plus, ShieldOff } from 'lucide-react';
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

export default function PurchaseOrderListPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();
  const canCreate = (userPermissions ?? []).includes('purchase_order.create');

  const { data, isLoading, error } = trpc.procurement.purchaseOrder.list.useQuery({
    projectId,
  });

  // Client-side pagination over the full list
  const items = data ?? [];
  const total = items.length;
  const paged = items.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase Orders"
        description="Manage purchase orders for this project"
        actions={
          canCreate ? (
            <Button size="sm" asChild>
              <Link href={`/projects/${projectId}/procurement/purchase-orders/new`}>
                <Plus className="h-4 w-4 mr-1" />
                Create PO
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
            You don&apos;t have permission to view purchase orders in this project.
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
      ) : !paged.length ? (
        <EmptyState
          icon={FileText}
          title="No purchase orders"
          description="Purchase orders will appear here once created."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((po: any) => (
                <TableRow
                  key={po.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/procurement/purchase-orders/${po.id}`}
                      className="font-medium hover:underline"
                    >
                      {po.poNumber ?? (
                        <span className="text-muted-foreground italic">
                          {po.status === 'draft' ? 'Draft' : 'No reference'}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">
                    {po.title}
                  </TableCell>
                  <TableCell className="text-sm">
                    {po.vendor?.name ?? '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatMoney(po.totalAmount)} {po.currency}
                  </TableCell>
                  <TableCell>
                    <ProcurementStatusBadge status={po.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {po.deliveryDate
                      ? new Date(po.deliveryDate).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(po.createdAt).toLocaleDateString()}
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
