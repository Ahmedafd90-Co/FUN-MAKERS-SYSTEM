'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { Separator } from '@fmksa/ui/components/separator';
import { trpc } from '@/lib/trpc-client';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { TransitionActions } from '@/components/commercial/transition-actions';

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

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="text-sm mt-0.5">{value ?? '-'}</p>
    </div>
  );
}

export default function IpcDetailPage() {
  const params = useParams<{ id: string; ipcId: string }>();
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.commercial.ipc.get.useQuery({
    projectId: params.id,
    id: params.ipcId,
  });

  const transitionMut = trpc.commercial.ipc.transition.useMutation({
    onSuccess: () => {
      utils.commercial.ipc.get.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-10 text-center text-sm text-destructive">
        {error?.message ?? 'IPC not found.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/commercial/ipc`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to IPCs
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            {data.referenceNumber ?? 'Draft IPC'}
          </h1>
          <CommercialStatusBadge status={data.status} />
        </div>
        <TransitionActions
          currentStatus={data.status}
          recordFamily="ipc"
          permissions={['ipc.transition']}
          isLoading={transitionMut.isPending}
          onTransition={async (action, comment) => {
            await transitionMut.mutateAsync({
              projectId: params.id,
              id: params.ipcId,
              action,
              comment,
            });
          }}
        />
      </div>

      <Separator />

      {/* Financial Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Financial Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Certified Amount"
            value={`${formatMoney(data.certifiedAmount)} ${data.currency}`}
          />
          <Field
            label="Retention Amount"
            value={`${formatMoney(data.retentionAmount)} ${data.currency}`}
          />
          {data.adjustments != null && (
            <Field
              label="Adjustments"
              value={`${formatMoney(data.adjustments)} ${data.currency}`}
            />
          )}
          <Field
            label="Net Certified"
            value={
              <span className="font-semibold">
                {formatMoney(data.netCertified)} {data.currency}
              </span>
            }
          />
          <Field label="Currency" value={data.currency} />
        </CardContent>
      </Card>

      {/* Certification Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Certification Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Certification Date"
            value={new Date(data.certificationDate).toLocaleDateString()}
          />
          <Field
            label="Linked IPA"
            value={
              <Link
                href={`/projects/${params.id}/commercial/ipa/${data.ipaId}`}
                className="text-primary hover:underline"
              >
                View IPA
              </Link>
            }
          />
          <Field
            label="Created"
            value={new Date(data.createdAt).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      {/* Remarks */}
      {data.remarks && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Remarks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{data.remarks}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
