'use client';

import { useParams, useRouter } from 'next/navigation';
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

export default function IpaDetailPage() {
  const params = useParams<{ id: string; ipaId: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.commercial.ipa.get.useQuery({
    projectId: params.id,
    id: params.ipaId,
  });

  const transitionMut = trpc.commercial.ipa.transition.useMutation({
    onSuccess: () => {
      utils.commercial.ipa.get.invalidate();
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
        {error?.message ?? 'IPA not found.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/commercial/ipa`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to IPAs
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            {data.referenceNumber ?? 'Draft IPA'}
          </h1>
          <CommercialStatusBadge status={data.status} />
        </div>
        <TransitionActions
          currentStatus={data.status}
          recordFamily="ipa"
          permissions={['ipa.transition']}
          isLoading={transitionMut.isPending}
          onTransition={async (action, comment) => {
            await transitionMut.mutateAsync({
              projectId: params.id,
              id: params.ipaId,
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
            label="Gross Amount"
            value={`${formatMoney(data.grossAmount)} ${data.currency}`}
          />
          <Field
            label="Retention Amount"
            value={`${formatMoney(data.retentionAmount)} ${data.currency}`}
          />
          <Field
            label="Retention Rate"
            value={
              data.retentionRate != null
                ? `${parseFloat(String(data.retentionRate)).toFixed(2)}%`
                : '-'
            }
          />
          <Field
            label="Previous Certified"
            value={`${formatMoney(data.previousCertified)} ${data.currency}`}
          />
          <Field
            label="Current Claim"
            value={`${formatMoney(data.currentClaim)} ${data.currency}`}
          />
          <Field
            label="Net Claimed"
            value={
              <span className="font-semibold">
                {formatMoney(data.netClaimed)} {data.currency}
              </span>
            }
          />
          {data.advanceRecovery != null && (
            <Field
              label="Advance Recovery"
              value={`${formatMoney(data.advanceRecovery)} ${data.currency}`}
            />
          )}
          {data.otherDeductions != null && (
            <Field
              label="Other Deductions"
              value={`${formatMoney(data.otherDeductions)} ${data.currency}`}
            />
          )}
        </CardContent>
      </Card>

      {/* Period Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Period Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Period Number"
            value={data.periodNumber != null ? `Period ${data.periodNumber}` : '-'}
          />
          <Field
            label="Period From"
            value={new Date(data.periodFrom).toLocaleDateString()}
          />
          <Field
            label="Period To"
            value={new Date(data.periodTo).toLocaleDateString()}
          />
          <Field
            label="Currency"
            value={data.currency}
          />
          <Field
            label="Created"
            value={new Date(data.createdAt).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      {/* Description */}
      {data.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{data.description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
