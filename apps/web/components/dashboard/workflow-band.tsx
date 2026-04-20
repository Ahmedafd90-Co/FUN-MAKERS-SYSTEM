'use client';

/**
 * WorkflowBand — operational workflow visibility for /home.
 *
 * Four compact modules, each showing up to five rows of real workflow
 * records:
 *   - Awaiting My Action     (in_progress where I'm the current approver)
 *   - Returned to Me         (returned where I'm the current approver)
 *   - Waiting With Others    (I started it, it's now with someone else)
 *   - Recently Approved by Me (my latest approve actions)
 *
 * All data comes from dashboard.summary.workflowBand — no separate query,
 * no client-side fabrication. Empty modules render muted empty states
 * rather than hiding, so users always see the shape of what's available.
 */
import Link from 'next/link';
import { SummaryModule } from './summary-module';

type WorkflowBandRow = {
  instanceId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  recordType: string;
  recordId: string;
  referenceNumber: string | null;
  currentStepName: string | null;
  status: string;
  updatedAt: string | Date;
};

type WorkflowBandData = {
  awaitingMyAction: WorkflowBandRow[];
  returnedToMe: WorkflowBandRow[];
  waitingWithOthers: WorkflowBandRow[];
  recentlyApprovedByMe: WorkflowBandRow[];
};

export function WorkflowBand({ data }: { data: WorkflowBandData }) {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      <SummaryModule
        eyebrow="Your queue"
        title="Awaiting my action"
        helper={
          data.awaitingMyAction.length > 0
            ? 'Things only you can move forward.'
            : undefined
        }
      >
        <WorkflowBandRowList
          rows={data.awaitingMyAction}
          emptyLabel="Nothing in your queue right now."
          timeLabel="started"
        />
      </SummaryModule>

      <SummaryModule
        eyebrow="Needs rework"
        title="Returned to me"
        helper={
          data.returnedToMe.length > 0
            ? 'Sent back for changes.'
            : undefined
        }
      >
        <WorkflowBandRowList
          rows={data.returnedToMe}
          emptyLabel="Nothing has been returned to you."
          timeLabel="returned"
        />
      </SummaryModule>

      <SummaryModule
        eyebrow="In flight"
        title="Waiting with others"
        helper={
          data.waitingWithOthers.length > 0
            ? 'Items you started, now with someone else.'
            : undefined
        }
      >
        <WorkflowBandRowList
          rows={data.waitingWithOthers}
          emptyLabel="Nothing you started is waiting elsewhere."
          timeLabel="started"
        />
      </SummaryModule>

      <SummaryModule
        eyebrow="Momentum"
        title="Recently approved by me"
        helper={
          data.recentlyApprovedByMe.length > 0
            ? 'Your last approval actions.'
            : undefined
        }
      >
        <WorkflowBandRowList
          rows={data.recentlyApprovedByMe}
          emptyLabel="No recent approvals from you."
          timeLabel="approved"
        />
      </SummaryModule>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row list
// ---------------------------------------------------------------------------

function WorkflowBandRowList({
  rows,
  emptyLabel,
  timeLabel,
}: {
  rows: WorkflowBandRow[];
  emptyLabel: string;
  timeLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-body-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="-mx-2 divide-y divide-border/70">
      {rows.map((row) => (
        <li key={row.instanceId}>
          <WorkflowBandRow row={row} timeLabel={timeLabel} />
        </li>
      ))}
    </ul>
  );
}

function WorkflowBandRow({
  row,
  timeLabel,
}: {
  row: WorkflowBandRow;
  timeLabel: string;
}) {
  const href = recordRoutePath(row.projectId, row.recordType, row.recordId);
  const refText = row.referenceNumber ?? shortId(row.recordId);
  const stateText = row.currentStepName ?? stateLabel(row.status);
  return (
    <Link
      href={href}
      className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {recordTypeLabel(row.recordType)}{' '}
          <span className="font-mono text-xs text-muted-foreground">
            · {refText}
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {formatRelative(row.updatedAt)} {timeLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">
          {stateText}
        </span>
        <span className="shrink-0 truncate text-[11px] text-muted-foreground/80">
          {row.projectCode}
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RECORD_TYPE_LABELS: Record<string, string> = {
  cost_proposal: 'Cost Proposal',
  variation: 'Variation',
  ipa: 'IPA',
  ipc: 'IPC',
  tax_invoice: 'Tax Invoice',
  correspondence: 'Correspondence',
  engineer_instruction: 'Engineer Instruction',
  purchase_order: 'Purchase Order',
  rfq: 'RFQ',
  supplier_invoice: 'Supplier Invoice',
  credit_note: 'Credit Note',
  expense: 'Expense',
};

function recordTypeLabel(recordType: string): string {
  return RECORD_TYPE_LABELS[recordType] ?? humanise(recordType);
}

function humanise(key: string): string {
  return key
    .split('_')
    .map((p) => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(' ');
}

function stateLabel(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'In progress';
    case 'returned':
      return 'Returned';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return humanise(status);
  }
}

const RECORD_TYPE_ROUTES: Record<
  string,
  (projectId: string, recordId: string) => string
> = {
  cost_proposal: (p, id) => `/projects/${p}/commercial/cost-proposals/${id}`,
  variation: (p, id) => `/projects/${p}/commercial/variations/${id}`,
  ipa: (p, id) => `/projects/${p}/commercial/ipa/${id}`,
  ipc: (p, id) => `/projects/${p}/commercial/ipc/${id}`,
  tax_invoice: (p, id) => `/projects/${p}/commercial/invoices/${id}`,
  correspondence: (p, id) => `/projects/${p}/commercial/correspondence/${id}`,
  engineer_instruction: (p, id) =>
    `/projects/${p}/commercial/engineer-instructions/${id}`,
  purchase_order: (p, id) => `/projects/${p}/procurement/purchase-orders/${id}`,
  rfq: (p, id) => `/projects/${p}/procurement/rfq/${id}`,
  supplier_invoice: (p, id) =>
    `/projects/${p}/procurement/supplier-invoices/${id}`,
  credit_note: (p, id) => `/projects/${p}/procurement/credit-notes/${id}`,
  expense: (p, id) => `/projects/${p}/procurement/expenses/${id}`,
};

function recordRoutePath(
  projectId: string,
  recordType: string,
  recordId: string,
): string {
  const builder = RECORD_TYPE_ROUTES[recordType];
  if (builder) return builder(projectId, recordId);
  // Fallback — project root. Keeps the link truthful rather than broken.
  return `/projects/${projectId}`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatRelative(at: string | Date): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  const diff = Date.now() - d.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}
