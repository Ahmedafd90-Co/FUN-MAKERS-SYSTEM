'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Building2, ShieldOff } from 'lucide-react';
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
import { ProcurementStatusBadge } from '@/components/procurement/procurement-status-badge';

export default function ProjectVendorsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const { data, isLoading, error } = trpc.procurement.projectVendor.list.useQuery({
    projectId,
  });

  const items = data ?? [];

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
        title="Project Vendors"
        description="Vendors linked to this project (read-only view of the active roster)."
      />

      {error?.data?.code === 'FORBIDDEN' ? (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to view vendors in this project.
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
      ) : !items.length ? (
        <EmptyState
          icon={Building2}
          title="No vendors linked"
          description="Vendors linked to this project will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Vendor Status</TableHead>
                <TableHead>Link Status</TableHead>
                <TableHead>Approved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((pv: any) => (
                <TableRow key={pv.id}>
                  <TableCell className="font-mono text-xs">
                    {pv.vendor?.vendorCode ?? '-'}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {pv.vendor?.name ?? '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pv.vendor?.classification ?? '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {pv.vendor?.contactEmail ?? pv.vendor?.contactPhone ?? '-'}
                  </TableCell>
                  <TableCell>
                    {pv.vendor?.status ? (
                      <ProcurementStatusBadge status={pv.vendor.status} />
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={pv.status === 'active' ? 'default' : 'secondary'}
                      className="text-[11px]"
                    >
                      {pv.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {pv.approvedDate
                      ? new Date(pv.approvedDate).toLocaleDateString()
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{items.length} total</p>
    </div>
  );
}
