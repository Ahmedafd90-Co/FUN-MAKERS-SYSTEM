'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { cn } from '@fmksa/ui/lib/utils';

/**
 * Status-specific styling that makes lifecycle states visually meaningful.
 *
 * Each status maps to a Badge variant PLUS optional className overrides
 * so that "draft" clearly feels incomplete, "signed" feels authoritative,
 * "rejected" feels terminal, etc.
 */
const STATUS_CONFIG: Record<
  string,
  { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  // --- Pre-approval lifecycle ---
  draft: {
    variant: 'outline',
    className: 'border-dashed text-muted-foreground',
  },
  submitted: {
    variant: 'secondary',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  },
  under_review: {
    variant: 'secondary',
    className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700',
  },
  returned: {
    variant: 'secondary',
    className: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700',
  },
  // --- Post-approval lifecycle ---
  approved_internal: {
    variant: 'default',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700',
  },
  signed: {
    variant: 'default',
    className: 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-700 dark:text-emerald-50 dark:border-emerald-600',
  },
  issued: {
    variant: 'default',
    className: 'bg-emerald-700 text-white border-emerald-800 dark:bg-emerald-800 dark:text-emerald-50 dark:border-emerald-700',
  },
  // --- Terminal states ---
  rejected: {
    variant: 'destructive',
    className: '',
  },
  superseded: {
    variant: 'outline',
    className: 'text-muted-foreground line-through',
  },
  closed: {
    variant: 'outline',
    className: 'bg-muted/50 text-muted-foreground',
  },
  cancelled: {
    variant: 'outline',
    className: 'bg-muted/50 text-muted-foreground line-through',
  },
  // --- Post-issuance / Correspondence statuses ---
  client_pending: {
    variant: 'secondary',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  },
  client_approved: {
    variant: 'default',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200',
  },
  client_rejected: {
    variant: 'destructive',
    className: '',
  },
  response_due: {
    variant: 'secondary',
    className: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200',
  },
  responded: {
    variant: 'default',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200',
  },
  under_evaluation: {
    variant: 'secondary',
    className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200',
  },
  // --- EI-specific statuses ---
  received: {
    variant: 'secondary',
    className: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900 dark:text-slate-200',
  },
  approved_reserve: {
    variant: 'default',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200',
  },
  converted: {
    variant: 'default',
    className: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900 dark:text-purple-200',
  },
  expired: {
    variant: 'outline',
    className: 'bg-muted/50 text-muted-foreground',
  },
  partially_accepted: {
    variant: 'secondary',
    className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-200',
  },
  accepted: {
    variant: 'default',
    className: 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-700 dark:text-emerald-50',
  },
  disputed: {
    variant: 'destructive',
    className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200',
  },
  acknowledged: {
    variant: 'secondary',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
  },
  recovered: {
    variant: 'default',
    className: 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-700 dark:text-emerald-50',
  },
  partially_recovered: {
    variant: 'secondary',
    className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-200',
  },
  linked_to_variation: {
    variant: 'default',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200',
  },
  partially_collected: {
    variant: 'secondary',
    className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-200',
  },
  collected: {
    variant: 'default',
    className: 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-700 dark:text-emerald-50',
  },
  overdue: {
    variant: 'destructive',
    className: '',
  },
  // --- Procurement statuses ---
  approved: {
    variant: 'default',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200',
  },
  partially_delivered: {
    variant: 'secondary',
    className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-200',
  },
  delivered: {
    variant: 'default',
    className: 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-700 dark:text-emerald-50',
  },
  paid: {
    variant: 'default',
    className: 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-700 dark:text-emerald-50',
  },
  verified: {
    variant: 'secondary',
    className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200',
  },
  applied: {
    variant: 'default',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200',
  },
};

export function CommercialStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { variant: 'outline' as const };
  return (
    <Badge
      variant={config.variant}
      className={cn('capitalize whitespace-nowrap', config.className)}
    >
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
