'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Wallet, Plus, ShieldOff } from 'lucide-react';
import { Badge } from '@fmksa/ui/components/badge';
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

const SUBTYPE_LABELS: Record<string, string> = {
  ticket: 'Ticket',
  accommodation: 'Accommodation',
  transportation: 'Transportation',
  equipment: 'Equipment',
};

export default function ExpenseListPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: userPermissions } = trpc.procurement.myPermissions.useQuery();
  const canCreate = (userPermissions ?? []).includes('expense.create');

  const { data, isLoading, error } = trpc.procurement.expense.list.useQuery({
    projectId,
  });

  const items = data ?? [];
  const total = items.length;
  const paged = items.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses"
        description="Track project expenses — tickets, accommodation, transport, equipment"
        actions={
          canCreate ? (
            <Button size="sm" asChild>
              <Link href={`/projects/${projectId}/procurement/expenses/new`}>
                <Plus className="h-4 w-4 mr-1" />
                Record Expense
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
            You don&apos;t have permission to view expenses in this project.
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
          icon={Wallet}
          title="No expenses"
          description="Expenses will appear here once recorded."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expense Date</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((exp: any) => (
                <TableRow
                  key={exp.id}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/procurement/expenses/${exp.id}`}
                      className="font-medium hover:underline"
                    >
                      {exp.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {SUBTYPE_LABELS[exp.subtype] ?? exp.subtype}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatMoney(exp.amount)} {exp.currency}
                  </TableCell>
                  <TableCell>
                    <ProcurementStatusBadge status={exp.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {exp.expenseDate
                      ? new Date(exp.expenseDate).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(exp.createdAt).toLocaleDateString()}
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
