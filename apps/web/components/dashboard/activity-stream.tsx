'use client';

/**
 * ActivityStream — recent audit-log activity for the dashboard.
 *
 * Each entry: humanized action label + relative time. Compact rows so a
 * good 5–6 entries fit in a single column without scroll.
 *
 * Admin-only data source — non-admin users see a quiet empty-state row.
 */
const ACTIVITY_LABELS: Record<string, string> = {
  'tax_invoice.transition.collection_partially_collected':
    'Invoice partially collected',
  'tax_invoice.transition.collection_collected': 'Invoice fully collected',
  'invoice_collection.record': 'Collection recorded',
  'tax_invoice.create': 'Tax invoice created',
  'tax_invoice.transition.issue': 'Tax invoice issued',
  'tax_invoice.transition.submit': 'Tax invoice submitted',
  'ipc.create': 'IPC created',
  'ipc.transition.sign': 'IPC signed',
  'ipc.transition.approve_internal': 'IPC approved',
  'ipa.create': 'IPA created',
  'ipa.transition.approve_internal': 'IPA approved',
  'ipa.transition.submit': 'IPA submitted',
  'variation.create': 'Variation created',
  'variation.transition.approve_internal': 'Variation approved',
  'variation.transition.issue': 'Variation issued',
  'variation.transition.client_approve': 'Variation client approved',
  'cost_proposal.create': 'Cost proposal created',
  'cost_proposal.transition.approve_internal': 'Cost proposal approved',
  'correspondence.create': 'Correspondence created',
  'correspondence.transition.issue': 'Correspondence issued',
  'auth.sign_in': 'User signed in',
  'auth.sign_out': 'User signed out',
  'user.create': 'User created',
  'user.update': 'User updated',
  'project.create': 'Project created',
  'project.update': 'Project settings updated',
};

function humanizeAction(action: string): string {
  if (ACTIVITY_LABELS[action]) return ACTIVITY_LABELS[action]!;
  return action
    .replace(/\./g, ' \u203A ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function relativeTime(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type ActivityEntry = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorSource: string | null;
  createdAt: Date | string;
};

export function ActivityStream({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-body-sm text-muted-foreground">
        Nothing recent to show.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-body-sm text-foreground truncate">
              {humanizeAction(entry.action)}
            </p>
            <p className="text-meta text-muted-foreground/70 truncate">
              {entry.resourceType.replace(/_/g, ' ')}
            </p>
          </div>
          <span className="shrink-0 text-meta tabular-nums text-muted-foreground/60 font-mono">
            {relativeTime(entry.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
