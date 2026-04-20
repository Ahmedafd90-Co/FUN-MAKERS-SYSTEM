'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Receipt, Plus, ShieldOff } from 'lucide-react';
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

export default function SupplierInvoiceListPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();
  const canCreate = (userPermissions ?? []).includes('supplier_invoice.create');

  const { data, isLoading, error } = trpc.procurement.supplierInvoice.list.useQuery({
    projectId,
  });

  const items = data ?? [];
  const total = items.length;
  const paged = items.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier Invoices"
        description="Track and manage supplier invoices"
        actions={
          canCreate ? (
            <Button size="sm" asChild>
              <Link href={`/projects/${projectId}/procurement/supplier-invoices/new`}>
                <Plus className="h-4 w-4 mr-1" />
                Record Invoice
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
            You don&apos;t have permission to view supplier invoices in this project.
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
          icon={Receipt}
          title="No supplier invoices"
          description="Supplier invoices will appear here once recorded."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead variant="compact">Invoice #</TableHead>
                <TableHead variant="compact">Vendor</TableHead>
                <TableHead variant="compact">PO</TableHead>
                <TableHead variant="compact" className="text-right">Gross</TableHead>
                <TableHead variant="compact" className="text-right">VAT</TableHead>
                <TableHead variant="compact" className="text-right">Total</TableHead>
                <TableHead variant="compact">Status</TableHead>
                <TableHead variant="compact">Due Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((si) => (
                <TableRow
                  key={si.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/procurement/supplier-invoices/${si.id}`}
                      className="font-medium hover:underline"
                    >
                      {si.invoiceNumber ?? si.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {si.vendor?.name ?? '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {si.purchaseOrder?.poNumber ?? '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatMoney(si.grossAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatMoney(si.vatAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatMoney(si.totalAmount)} {si.currency}
                  </TableCell>
                  <TableCell>
                    <ProcurementStatusBadge status={si.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {si.dueDate
                      ? new Date(si.dueDate).toLocaleDateString()
                      : '-'}
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
