'use client';

import { Badge } from '@fmksa/ui/components/badge';

/**
 * Procurement-specific status badge.
 *
 * Maps all RFQ and Quotation statuses to badge variants.
 * Procurement owns this mapping — not shared with commercial.
 */

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  // RFQ statuses
  draft: 'outline',
  under_review: 'secondary',
  returned: 'secondary',
  approved_internal: 'default',
  issued: 'default',
  responses_received: 'secondary',
  evaluation: 'secondary',
  awarded: 'default',
  rejected: 'destructive',
  cancelled: 'outline',
  closed: 'outline',

  // Quotation statuses
  received: 'secondary',
  shortlisted: 'default',
  expired: 'outline',

  // PO / SI / Expense / Credit Note statuses
  submitted: 'secondary',
  approved: 'default',
  partially_delivered: 'secondary',
  delivered: 'default',
  disputed: 'destructive',
  paid: 'default',
  verified: 'default',
  applied: 'default',
};

/** Short display labels for statuses that are too long when rendered raw. */
const STATUS_LABELS: Record<string, string> = {
  under_review: 'Under Review',
  approved_internal: 'Approved',
  responses_received: 'Responses In',
  evaluation: 'Evaluation',
  awarded: 'Awarded',
  shortlisted: 'Shortlisted',
  partially_delivered: 'Partial Delivery',
};

export function ProcurementStatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? 'outline';
  const label =
    STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
  return (
    <Badge variant={variant} className="capitalize whitespace-nowrap">
      {label}
    </Badge>
  );
}
