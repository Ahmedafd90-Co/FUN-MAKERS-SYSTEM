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
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';

import { EmptyState } from '@/components/ui/empty-state';

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
  status: string;
  startedAt: Date;
  currentStepStartedAt: Date;
  hoursWaiting: number;
  slaHours: number | null;
  hoursRemaining: number | null;
  isBreached: boolean;
  templateId: string;
  templateCode: string;
  previousSteps: Array<{ id: string; name: string; orderIndex: number }>;
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
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Workflow steps waiting for your approval across all assigned projects.
        </p>
      </div>

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
                    <Badge variant="outline" className="text-xs">
                      {item.recordType}
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
                    Record: {item.recordId}
                  </p>
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
                  Step: <span className="font-medium text-foreground">{item.currentStepName}</span>
                </span>
                <span>
                  Waiting: {formatWaitTime(item.hoursWaiting)}
                </span>
                {item.slaHours != null && (
                  <span>
                    SLA: {item.slaHours}h
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => setApproveItem(item as unknown as ApprovalItem)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Approve
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
