'use client';

import { Badge } from '@fmksa/ui/components/badge';

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  submitted: 'secondary',
  under_review: 'secondary',
  returned: 'secondary',
  approved_internal: 'default',
  signed: 'default',
  issued: 'default',
  rejected: 'destructive',
  superseded: 'outline',
  closed: 'outline',
  // Post-issuance statuses
  client_pending: 'secondary',
  client_approved: 'default',
  client_rejected: 'destructive',
  response_due: 'secondary',
  responded: 'default',
  under_evaluation: 'secondary',
  partially_accepted: 'secondary',
  accepted: 'default',
  disputed: 'destructive',
  acknowledged: 'secondary',
  recovered: 'default',
  partially_recovered: 'secondary',
  linked_to_variation: 'default',
  partially_collected: 'secondary',
  collected: 'default',
  overdue: 'destructive',
  cancelled: 'outline',
};

export function CommercialStatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? 'outline';
  return (
    <Badge variant={variant} className="capitalize whitespace-nowrap">
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
