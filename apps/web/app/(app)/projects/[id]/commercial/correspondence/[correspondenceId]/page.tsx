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
import { Badge } from '@fmksa/ui/components/badge';
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

const SUBTYPE_LABELS: Record<string, string> = {
  letter: 'Letter',
  notice: 'Notice',
  claim: 'Claim',
  back_charge: 'Back Charge',
};

// Post-issuance tracking subtypes
const POST_ISSUANCE_SUBTYPES = ['notice', 'claim', 'back_charge'];

export default function CorrespondenceDetailPage() {
  const params = useParams<{ id: string; correspondenceId: string }>();
  const utils = trpc.useUtils();

  const { data, isLoading, error } =
    trpc.commercial.correspondence.get.useQuery({
      projectId: params.id,
      id: params.correspondenceId,
    });

  const transitionMut = trpc.commercial.correspondence.transition.useMutation({
    onSuccess: () => {
      utils.commercial.correspondence.get.invalidate();
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
        {error?.message ?? 'Correspondence not found.'}
      </div>
    );
  }

  const isPostIssuance = POST_ISSUANCE_SUBTYPES.includes(data.subtype);

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${params.id}/commercial/correspondence`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Correspondence
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">
              {data.referenceNumber ?? 'Draft Correspondence'}
            </h1>
            <Badge variant="outline">
              {SUBTYPE_LABELS[data.subtype] ?? data.subtype}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{data.subject}</p>
          <CommercialStatusBadge status={data.status} />
        </div>
        <TransitionActions
          currentStatus={data.status}
          recordFamily="correspondence"
          permissions={['correspondence.transition']}
          isLoading={transitionMut.isPending}
          onTransition={async (action, comment) => {
            await transitionMut.mutateAsync({
              projectId: params.id,
              id: params.correspondenceId,
              action,
              comment,
            });
          }}
        />
      </div>

      <Separator />

      {/* Header info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Correspondence Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="Recipient" value={data.recipientName} />
          {data.recipientOrg && (
            <Field label="Organisation" value={data.recipientOrg} />
          )}
          <Field
            label="Created"
            value={new Date(data.createdAt).toLocaleDateString()}
          />
          {data.currency && (
            <Field label="Currency" value={data.currency} />
          )}
        </CardContent>
      </Card>

      {/* Notice-specific fields */}
      {data.subtype === 'notice' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notice Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {data.noticeType && (
              <Field
                label="Notice Type"
                value={String(data.noticeType).replace(/_/g, ' ')}
              />
            )}
            {data.contractClause && (
              <Field label="Contract Clause" value={data.contractClause} />
            )}
            {data.responseDeadline && (
              <Field
                label="Response Deadline"
                value={new Date(data.responseDeadline).toLocaleDateString()}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Claim-specific fields */}
      {data.subtype === 'claim' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Claim Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {data.claimType && (
              <Field
                label="Claim Type"
                value={String(data.claimType).replace(/_/g, ' ')}
              />
            )}
            {data.claimedAmount != null && (
              <Field
                label="Claimed Amount"
                value={`${formatMoney(data.claimedAmount)} ${data.currency ?? ''}`}
              />
            )}
            {data.claimedTimeDays != null && (
              <Field
                label="Claimed Time (days)"
                value={String(data.claimedTimeDays)}
              />
            )}
            {data.settledAmount != null && (
              <Field
                label="Settled Amount"
                value={`${formatMoney(data.settledAmount)} ${data.currency ?? ''}`}
              />
            )}
            {data.settledTimeDays != null && (
              <Field
                label="Settled Time (days)"
                value={String(data.settledTimeDays)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Back charge-specific fields */}
      {data.subtype === 'back_charge' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Back Charge Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {data.targetName && (
              <Field label="Target" value={data.targetName} />
            )}
            {data.category && (
              <Field
                label="Category"
                value={String(data.category).replace(/_/g, ' ')}
              />
            )}
            {data.chargedAmount != null && (
              <Field
                label="Charged Amount"
                value={`${formatMoney(data.chargedAmount)} ${data.currency ?? ''}`}
              />
            )}
            {data.evidenceDescription && (
              <Field
                label="Evidence"
                value={data.evidenceDescription}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Body */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Body</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{data.body}</p>
        </CardContent>
      </Card>

      {/* Post-issuance tracking note */}
      {isPostIssuance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Post-Issuance Tracking</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Current status:{' '}
              <CommercialStatusBadge status={data.status} />
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
