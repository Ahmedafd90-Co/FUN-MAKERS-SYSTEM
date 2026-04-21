'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fmksa/ui/components/dialog';
import { Label } from '@fmksa/ui/components/label';
import { FileSpreadsheet, Info, Lock } from 'lucide-react';
import { useState } from 'react';

// Maps status -> allowed actions for display
const STATUS_ACTIONS: Record<string, Array<{ action: string; label: string; variant?: 'default' | 'destructive' | 'outline' | 'secondary' }>> = {
  draft: [{ action: 'submit', label: 'Submit', variant: 'default' }],
  submitted: [
    { action: 'review', label: 'Start Review', variant: 'default' },
    { action: 'return', label: 'Return', variant: 'outline' },
    { action: 'reject', label: 'Reject', variant: 'destructive' },
  ],
  under_review: [
    { action: 'approve', label: 'Approve', variant: 'default' },
    { action: 'return', label: 'Return', variant: 'outline' },
    { action: 'reject', label: 'Reject', variant: 'destructive' },
  ],
  returned: [{ action: 'submit', label: 'Re-submit', variant: 'default' }],
  approved_internal: [
    { action: 'sign', label: 'Sign', variant: 'default' },
    { action: 'issue', label: 'Issue', variant: 'default' },
  ],
  signed: [{ action: 'issue', label: 'Issue', variant: 'default' }],
  issued: [
    { action: 'close', label: 'Close', variant: 'outline' },
    { action: 'supersede', label: 'Supersede', variant: 'outline' },
  ],
  // --- Variation client-approval phase (VO only) ---
  client_pending: [
    { action: 'client_approved', label: 'Client Approved', variant: 'default' },
    { action: 'client_rejected', label: 'Client Rejected', variant: 'destructive' },
  ],
  client_approved: [
    { action: 'close', label: 'Close', variant: 'outline' },
  ],
  client_rejected: [],
};

const COMMENT_REQUIRED_ACTIONS = ['reject', 'return', 'client_rejected'];
const CONFIRM_ACTIONS = ['reject', 'return', 'supersede', 'cancel', 'close', 'client_rejected', 'client_approved'];

/**
 * Actions that are managed by the workflow engine when a workflow instance
 * is active. Hidden from the UI and blocked at the backend.
 */
const WORKFLOW_MANAGED_ACTIONS = ['review', 'approve', 'reject', 'return'];

type Props = {
  currentStatus: string;
  recordFamily: string;
  permissions: string[];
  onTransition: (action: string, comment?: string) => Promise<void>;
  isLoading?: boolean | undefined;
  extraActions?: Array<{ action: string; label: string; variant?: 'default' | 'destructive' | 'outline' | 'secondary' }> | undefined;
  /** When true, approval-phase actions (review/approve/reject/return) are hidden — the workflow drives those. */
  hasActiveWorkflow?: boolean | undefined;
  /**
   * Record origin. When `imported_historical`, we suppress the full live
   * transition set — the backend throws on any transition call for these
   * records (see packages/core/src/commercial/ipa/service.ts and parallel
   * services), so offering clickable buttons is guaranteed UX failure.
   * Instead, we render a small locked badge so operators can see WHY no
   * actions are available.
   *
   * Defaults to `live` for safety — any caller that forgets to pass it
   * keeps the current behavior unchanged.
   */
  origin?: 'live' | 'imported_historical' | string | null | undefined;
};

export function TransitionActions({ currentStatus, recordFamily, permissions, onTransition, isLoading, extraActions, hasActiveWorkflow, origin }: Props) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; label: string } | null>(null);
  const [comment, setComment] = useState('');

  // Imported-historical records are append-only at the business layer.
  // Suppress every transition (including extraActions) and render a locked
  // badge so operators understand the record is frozen by provenance, not
  // missing a permission.
  if (origin === 'imported_historical') {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground border-dashed"
        title="This record was imported from a historical sheet. Live lifecycle actions (Submit, Approve, Sign, Issue, Close) are not available because the record is append-only — use the 'Adjust imported' path when a correction is needed."
      >
        <FileSpreadsheet className="h-3 w-3" />
        <Lock className="h-3 w-3" />
        Frozen — imported historical
      </Badge>
    );
  }

  const baseActions = STATUS_ACTIONS[currentStatus] ?? [];
  // When a workflow controls the approval phase, filter out managed actions.
  // Only pre-workflow (submit/re-submit) and post-workflow (sign/issue/close) remain.
  const filteredBase = hasActiveWorkflow
    ? baseActions.filter(({ action }) => !WORKFLOW_MANAGED_ACTIONS.includes(action))
    : baseActions;
  const allActions = [...filteredBase, ...(extraActions ?? [])];

  // Filter by per-action permission (e.g. ipa.submit, ipa.approve, ipa.sign)
  // Falls back to a generic {family}.transition if it exists, or {family}.edit as last resort
  const hasGenericPerm = permissions.includes(`${recordFamily}.transition`) || permissions.includes(`${recordFamily}.edit`);
  const permittedActions = allActions.filter(({ action }) => {
    // Check specific permission first: ipa.submit, ipa.approve, etc.
    if (permissions.includes(`${recordFamily}.${action}`)) return true;
    // close/supersede/cancel map to edit permission
    if (['close', 'supersede', 'cancel'].includes(action) && permissions.includes(`${recordFamily}.edit`)) return true;
    // Generic fallback
    return hasGenericPerm;
  });
  if (permittedActions.length === 0) return null;

  const handleClick = (action: string, label: string) => {
    if (CONFIRM_ACTIONS.includes(action)) {
      setConfirmAction({ action, label });
      setComment('');
    } else {
      doTransition(action);
    }
  };

  const doTransition = async (action: string, transitionComment?: string) => {
    setLoadingAction(action);
    try {
      await onTransition(action, transitionComment || undefined);
    } finally {
      setLoadingAction(null);
      setConfirmAction(null);
      setComment('');
    }
  };

  // Detect whether workflow-managed actions were hidden this render
  const workflowHidActions = hasActiveWorkflow
    ? baseActions.filter(({ action }) => WORKFLOW_MANAGED_ACTIONS.includes(action))
    : [];

  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {permittedActions.map(({ action, label, variant }) => (
            <Button
              key={action}
              size="sm"
              variant={variant ?? 'outline'}
              disabled={isLoading || loadingAction !== null}
              onClick={() => handleClick(action, label)}
            >
              {loadingAction === action ? 'Processing...' : label}
            </Button>
          ))}
        </div>

        {/* Explain hidden approval actions */}
        {workflowHidActions.length > 0 && (
          <p className="text-[11px] text-muted-foreground/70 flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              Approval, review, return, and rejection are handled by the approval workflow below. Use the workflow steps to advance this record.
            </span>
          </p>
        )}

        {/* Re-submit context when returned */}
        {currentStatus === 'returned' && hasActiveWorkflow && (
          <p className="text-[11px] text-muted-foreground/70 flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              Re-submitting sends this back to the approver who returned it. The workflow continues from where it left off — it does not restart from the beginning.
            </span>
          </p>
        )}
      </div>

      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm: {confirmAction?.label}</DialogTitle>
            <DialogDescription>
              {COMMENT_REQUIRED_ACTIONS.includes(confirmAction?.action ?? '')
                ? 'A comment is required for this action.'
                : 'Are you sure you want to proceed?'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="transition-comment">
                Comment {COMMENT_REQUIRED_ACTIONS.includes(confirmAction?.action ?? '') ? '(required)' : '(optional)'}
              </Label>
              <textarea
                id="transition-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter your reason..."
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmAction(null)}>
                Cancel
              </Button>
              <Button
                variant={['reject', 'cancel'].includes(confirmAction?.action ?? '') ? 'destructive' : 'default'}
                disabled={
                  loadingAction !== null ||
                  (COMMENT_REQUIRED_ACTIONS.includes(confirmAction?.action ?? '') && !comment.trim())
                }
                onClick={() => {
                  if (confirmAction) doTransition(confirmAction.action, comment);
                }}
              >
                {loadingAction ? 'Processing...' : `Confirm ${confirmAction?.label ?? ''}`}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
