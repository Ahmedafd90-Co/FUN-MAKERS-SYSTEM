'use client';

/**
 * My Approvals list — shows pending workflow approvals for the current user.
 *
 * Sorted by urgency: SLA breached first, then closest to SLA, then oldest.
 *
 * Task 1.5.11
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import {
  CheckCircle2,
  RotateCcw,
  XCircle,
  FileSignature,
  Send,
  Eye,
  ArrowRight,
  ClipboardCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';
import { outcomeActionLabel } from '@/lib/outcome-labels';

import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';

import {
  ApproveDialog,
  RejectDialog,
  ReturnDialog,
} from './approval-actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApprovalItem = {
  instanceId: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  recordType: string;
  recordId: string;
  currentStepId: string;
  currentStepName: string;
  currentStepOutcomeType: string;
  status: string;
  startedAt: Date;
  currentStepStartedAt: Date;
  hoursWaiting: number;
  slaHours: number | null;
  hoursRemaining: number | null;
  isBreached: boolean;
  templateId: string;
  templateCode: string;
  templateName: string;
  previousSteps: Array<{ id: string; name: string; orderIndex: number }>;
  previousHandlers: Array<{
    stepId: string;
    stepName: string;
    outcomeType: string | null;
    actorUserId: string;
    actorName: string;
    action: string;
    actedAt: string | Date;
  }>;
  nextStep: { name: string; outcomeType: string | null } | null;
  returnContext: {
    actorUserId: string;
    actorName: string;
    comment: string | null;
    actedAt: string | Date;
  } | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatWaitTime(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function SlaStatusBadge({
  slaHours,
  hoursRemaining,
  isBreached,
}: {
  slaHours: number | null;
  hoursRemaining: number | null;
  isBreached: boolean;
}) {
  if (slaHours == null) {
    return (
      <Badge variant="outline" className="text-xs">
        No SLA
      </Badge>
    );
  }

  if (isBreached) {
    return (
      <Badge variant="destructive" className="text-xs">
        Breached
      </Badge>
    );
  }

  if (hoursRemaining != null && hoursRemaining <= 4) {
    return (
      <Badge
        variant="secondary"
        className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs"
      >
        {formatWaitTime(hoursRemaining)} left
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs"
    >
      {hoursRemaining != null ? `${formatWaitTime(hoursRemaining)} left` : 'OK'}
    </Badge>
  );
}

const RECORD_TYPE_LABELS: Record<string, string> = {
  rfq: 'RFQ',
  ipa: 'IPA',
  ipc: 'IPC',
  variation: 'Variation',
  cost_proposal: 'Cost Proposal',
  tax_invoice: 'Tax Invoice',
  correspondence: 'Correspondence',
  engineer_instruction: 'Engineer Instruction',
  quotation: 'Quotation',
  purchase_order: 'Purchase Order',
  supplier_invoice: 'Supplier Invoice',
  expense: 'Expense',
  credit_note: 'Credit Note',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApprovalList() {
  const { data: approvals, isLoading } =
    trpc.workflow.myApprovals.useQuery();

  // Action dialog state
  const [approveItem, setApproveItem] = useState<ApprovalItem | null>(null);
  const [rejectItem, setRejectItem] = useState<ApprovalItem | null>(null);
  const [returnItem, setReturnItem] = useState<ApprovalItem | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Queue"
        title="My Approvals"
        description="Records that need your decision — approve, return for revision, or reject."
      />

      {/* Loading */}
      {isLoading && (
        <p className="text-muted-foreground py-8 text-center">
          Loading approvals...
        </p>
      )}

      {/* Empty state */}
      {!isLoading && (!approvals || approvals.length === 0) && (
        <EmptyState
          icon={CheckCircle2}
          title="No pending approvals"
          description="Your queue is clear — nothing needs your attention right now."
        />
      )}

      {/* Approval cards */}
      {!isLoading && approvals && approvals.length > 0 && (
        <div className="space-y-3">
          {approvals.map((item) => (
            <div
              key={item.instanceId}
              className="rounded-lg border border-border p-4 space-y-3"
            >
              {/* Top row: project + record info */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {item.projectName}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/60">
                      {item.projectCode}
                    </span>
                    <Badge variant="outline" className="text-xs uppercase">
                      {RECORD_TYPE_LABELS[item.recordType] ?? item.recordType}
                    </Badge>
                    {item.status === 'returned' && (
                      <Badge
                        variant="secondary"
                        className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs"
                      >
                        Returned
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <RecordLink
                      recordType={item.recordType}
                      recordId={item.recordId}
                      projectId={item.projectId}
                      recordReference={item.recordReference}
                    />
                  </p>
                  {item.templateName && (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      Workflow: <span className="font-medium text-muted-foreground">{item.templateName}</span>
                    </p>
                  )}
                </div>
                <SlaStatusBadge
                  slaHours={item.slaHours}
                  hoursRemaining={item.hoursRemaining}
                  isBreached={item.isBreached}
                />
              </div>

              {/* Step + timing info */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Your action needed: <span className="font-medium text-foreground">{item.currentStepName}</span>
                </span>
                <span>
                  Waiting {formatWaitTime(item.hoursWaiting)}
                </span>
                {item.slaHours != null && (
                  <span>
                    SLA: {item.slaHours}h
                  </span>
                )}
              </div>

              {/* Return context — amber callout with returner + reason */}
              {item.returnContext && (
                <ReturnCallout context={item.returnContext} />
              )}

              {/* Previous handlers strip */}
              {item.previousHandlers.length > 0 && (
                <HandlersStrip handlers={item.previousHandlers} />
              )}

              {/* Next-step preview */}
              {item.nextStep && (
                <NextStepLine nextStep={item.nextStep} />
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => setApproveItem(item as unknown as ApprovalItem)}
                >
                  <OutcomeIcon outcomeType={item.currentStepOutcomeType} className="h-3.5 w-3.5 mr-1" />
                  {outcomeActionLabel(item.currentStepOutcomeType)}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReturnItem(item as unknown as ApprovalItem)}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Return
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setRejectItem(item as unknown as ApprovalItem)}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <ApproveDialog
        open={!!approveItem}
        onOpenChange={(open) => !open && setApproveItem(null)}
        item={approveItem}
      />
      <RejectDialog
        open={!!rejectItem}
        onOpenChange={(open) => !open && setRejectItem(null)}
        item={rejectItem}
      />
      <ReturnDialog
        open={!!returnItem}
        onOpenChange={(open) => !open && setReturnItem(null)}
        item={returnItem}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecordLink — clickable link with human-readable record type label
// ---------------------------------------------------------------------------

function RecordLink({ recordType, recordId, projectId, recordReference }: { recordType: string; recordId: string; projectId: string; recordReference?: string | null | undefined }) {
  const labels: Record<string, string> = {
    rfq: 'RFQ',
    ipa: 'IPA',
    ipc: 'IPC',
    variation: 'Variation',
    cost_proposal: 'Cost Proposal',
    tax_invoice: 'Tax Invoice',
    correspondence: 'Correspondence',
    engineer_instruction: 'Engineer Instruction',
    quotation: 'Quotation',
    purchase_order: 'Purchase Order',
    supplier_invoice: 'Supplier Invoice',
    expense: 'Expense',
    credit_note: 'Credit Note',
  };

  const routes: Record<string, string> = {
    rfq: `/projects/${projectId}/procurement/rfq/${recordId}`,
    ipa: `/projects/${projectId}/commercial/ipa/${recordId}`,
    ipc: `/projects/${projectId}/commercial/ipc/${recordId}`,
    variation: `/projects/${projectId}/commercial/variations/${recordId}`,
    cost_proposal: `/projects/${projectId}/commercial/cost-proposals/${recordId}`,
    tax_invoice: `/projects/${projectId}/commercial/invoices/${recordId}`,
    correspondence: `/projects/${projectId}/commercial/correspondence/${recordId}`,
    engineer_instruction: `/projects/${projectId}/commercial/engineer-instructions/${recordId}`,
    quotation: `/projects/${projectId}/procurement/quotations/${recordId}`,
    purchase_order: `/projects/${projectId}/procurement/purchase-orders/${recordId}`,
    supplier_invoice: `/projects/${projectId}/procurement/supplier-invoices/${recordId}`,
    expense: `/projects/${projectId}/procurement/expenses/${recordId}`,
    credit_note: `/projects/${projectId}/procurement/credit-notes/${recordId}`,
  };

  const label = labels[recordType] ?? recordType;
  const href = routes[recordType];
  const displayRef = recordReference ?? recordId.slice(0, 8) + '...';

  if (href) {
    return (
      <Link href={href} className="text-primary hover:underline">
        {label} {displayRef}
      </Link>
    );
  }

  return <span>{label}: {displayRef}</span>;
}

// ---------------------------------------------------------------------------
// OutcomeIcon — icon matching the step's semantic purpose
// ---------------------------------------------------------------------------

function OutcomeIcon({ outcomeType, className }: { outcomeType?: string | undefined; className?: string | undefined }) {
  switch (outcomeType) {
    case 'review':
      return <Eye className={className} />;
    case 'sign':
      return <FileSignature className={className} />;
    case 'issue':
      return <Send className={className} />;
    case 'acknowledge':
      return <ClipboardCheck className={className} />;
    default:
      return <CheckCircle2 className={className} />;
  }
}

// ---------------------------------------------------------------------------
// Return callout — amber block with returner name + full comment
// ---------------------------------------------------------------------------

function ReturnCallout({
  context,
}: {
  context: {
    actorName: string;
    comment: string | null;
    actedAt: string | Date;
  };
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-3 py-2 space-y-1">
      <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
        Returned by {context.actorName}
        <span className="font-normal text-amber-700/70 dark:text-amber-300/70">
          {' '}
          · {formatActedAt(context.actedAt)}
        </span>
      </p>
      {context.comment && (
        <p className="text-xs text-amber-700 dark:text-amber-300 italic whitespace-pre-wrap">
          &ldquo;{context.comment}&rdquo;
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Handlers strip — "Already touched by: ✓ Sara · ↺ Khalid · ✓ Ahmed"
// ---------------------------------------------------------------------------

type HandlerChip = {
  stepName: string;
  outcomeType: string | null;
  actorName: string;
  action: string;
  actedAt: string | Date;
};

function HandlersStrip({ handlers }: { handlers: HandlerChip[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="shrink-0">Already touched by:</span>
      {handlers.map((h, i) => (
        <span key={`${h.actedAt.toString()}-${i}`} className="inline-flex items-center gap-0.5">
          {i > 0 && <span className="text-muted-foreground/40">·</span>}
          <HandlerChipIcon handler={h} />
          <span
            className={
              h.action === 'returned' || h.action === 'return'
                ? 'text-amber-700 dark:text-amber-400 font-medium'
                : 'text-foreground font-medium'
            }
            title={`${handlerLabel(h)} at "${h.stepName}" · ${formatActedAt(h.actedAt)}`}
          >
            {firstName(h.actorName)}
          </span>
        </span>
      ))}
    </div>
  );
}

function HandlerChipIcon({ handler }: { handler: HandlerChip }) {
  const cls = 'h-3 w-3 shrink-0';
  if (handler.action === 'returned' || handler.action === 'return') {
    return <RotateCcw className={`${cls} text-amber-600 dark:text-amber-400`} />;
  }
  if (handler.action === 'resubmitted') {
    return <ArrowRight className={`${cls} text-blue-600 dark:text-blue-400`} />;
  }
  if (handler.action === 'submit' || handler.action === 'started') {
    return <Send className={`${cls} text-blue-600 dark:text-blue-400`} />;
  }
  // approve / approved → the step's outcome icon (approve / review / sign / issue)
  return (
    <OutcomeIcon
      outcomeType={handler.outcomeType ?? undefined}
      className={`${cls} text-emerald-600 dark:text-emerald-400`}
    />
  );
}

function handlerLabel(h: HandlerChip): string {
  if (h.action === 'returned' || h.action === 'return') return 'Returned';
  if (h.action === 'resubmitted') return 'Re-submitted';
  if (h.action === 'submit' || h.action === 'started') return 'Submitted';
  if (h.action === 'approved' || h.action === 'approve') {
    switch (h.outcomeType) {
      case 'review':
        return 'Reviewed';
      case 'sign':
        return 'Signed';
      case 'issue':
        return 'Issued';
      case 'acknowledge':
        return 'Acknowledged';
      default:
        return 'Approved';
    }
  }
  return h.action;
}

// ---------------------------------------------------------------------------
// Next-step preview
// ---------------------------------------------------------------------------

function NextStepLine({
  nextStep,
}: {
  nextStep: { name: string; outcomeType: string | null };
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <ArrowRight className="h-3 w-3 shrink-0" />
      <span>
        Next:{' '}
        <span className="font-medium text-foreground">{nextStep.name}</span>
      </span>
      {nextStep.outcomeType && (
        <OutcomeIcon
          outcomeType={nextStep.outcomeType}
          className="h-3 w-3 shrink-0 text-muted-foreground/70"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function firstName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return 'Unknown';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function formatActedAt(at: string | Date): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
