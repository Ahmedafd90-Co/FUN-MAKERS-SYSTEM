'use client';

import { useState } from 'react';
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
import { Info } from 'lucide-react';

/**
 * Procurement transition actions — maps RFQ and Quotation statuses to
 * available workflow actions.
 *
 * Derived directly from:
 *   packages/core/src/procurement/rfq/transitions.ts
 *   packages/core/src/procurement/quotation/transitions.ts
 *
 * Permission filtering uses the same mapping as the backend
 * (packages/core/src/procurement/permission-map.ts).
 *
 * Now includes confirm dialogs and comment support, matching the commercial
 * modules' trust standard (Tier 2A parity).
 */

type ActionDef = {
  action: string;
  label: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary';
};

const RFQ_STATUS_ACTIONS: Record<string, ActionDef[]> = {
  draft: [{ action: 'submit', label: 'Submit for Review', variant: 'default' }],
  under_review: [
    { action: 'approve', label: 'Approve', variant: 'default' },
    { action: 'return', label: 'Return', variant: 'outline' },
    { action: 'reject', label: 'Reject', variant: 'destructive' },
  ],
  returned: [{ action: 'submit', label: 'Re-submit', variant: 'default' }],
  approved_internal: [{ action: 'issue', label: 'Issue to Vendors', variant: 'default' }],
  issued: [
    { action: 'receive_responses', label: 'Responses Received', variant: 'default' },
    { action: 'cancel', label: 'Cancel', variant: 'destructive' },
  ],
  responses_received: [{ action: 'evaluate', label: 'Start Evaluation', variant: 'default' }],
  // 'award' removed from generic actions — RFQ award requires selecting a
  // specific quotation, handled by dedicated UI in RFQ detail / compare page.
  evaluation: [
    { action: 'cancel', label: 'Cancel', variant: 'destructive' },
  ],
  awarded: [{ action: 'close', label: 'Close', variant: 'outline' }],
};

const QUOTATION_STATUS_ACTIONS: Record<string, ActionDef[]> = {
  received: [
    { action: 'review', label: 'Start Review', variant: 'default' },
    { action: 'expire', label: 'Mark Expired', variant: 'outline' },
  ],
  under_review: [
    { action: 'shortlist', label: 'Shortlist', variant: 'default' },
    { action: 'reject', label: 'Reject', variant: 'destructive' },
    { action: 'expire', label: 'Mark Expired', variant: 'outline' },
  ],
  // 'award' removed — quotation award happens only through RFQ award
  // (award integrity invariant). See RFQ detail / compare page.
  shortlisted: [
    { action: 'reject', label: 'Reject', variant: 'destructive' },
    { action: 'expire', label: 'Mark Expired', variant: 'outline' },
  ],
};

// ---------------------------------------------------------------------------
// Purchase Order actions — mirrors PO_ACTION_TO_STATUS from transitions.ts
// ---------------------------------------------------------------------------

const PO_STATUS_ACTIONS: Record<string, ActionDef[]> = {
  draft: [{ action: 'submit', label: 'Submit', variant: 'default' }],
  submitted: [
    { action: 'approve', label: 'Approve', variant: 'default' },
    { action: 'reject', label: 'Reject', variant: 'destructive' },
  ],
  approved: [
    { action: 'issue', label: 'Issue to Vendor', variant: 'default' },
    { action: 'cancel', label: 'Cancel', variant: 'destructive' },
  ],
  issued: [
    { action: 'partial_deliver', label: 'Partial Delivery', variant: 'outline' },
    { action: 'deliver', label: 'Mark Delivered', variant: 'default' },
    { action: 'cancel', label: 'Cancel', variant: 'destructive' },
  ],
  partially_delivered: [
    { action: 'deliver', label: 'Mark Delivered', variant: 'default' },
  ],
  delivered: [
    { action: 'close', label: 'Close', variant: 'outline' },
  ],
};

// ---------------------------------------------------------------------------
// Supplier Invoice actions — mirrors SI_ACTION_TO_STATUS from transitions.ts
// ---------------------------------------------------------------------------

const SI_STATUS_ACTIONS: Record<string, ActionDef[]> = {
  received: [{ action: 'review', label: 'Start Review', variant: 'default' }],
  under_review: [
    { action: 'approve', label: 'Approve', variant: 'default' },
    { action: 'dispute', label: 'Dispute', variant: 'destructive' },
    { action: 'reject', label: 'Reject', variant: 'destructive' },
  ],
  approved: [
    { action: 'pay', label: 'Mark Paid', variant: 'default' },
  ],
  disputed: [
    { action: 'review', label: 'Return to Review', variant: 'default' },
    { action: 'reject', label: 'Reject', variant: 'destructive' },
  ],
  paid: [
    { action: 'close', label: 'Close', variant: 'outline' },
  ],
};

// ---------------------------------------------------------------------------
// Expense actions — mirrors EXPENSE_ACTION_TO_STATUS from transitions.ts
// ---------------------------------------------------------------------------

const EXPENSE_STATUS_ACTIONS: Record<string, ActionDef[]> = {
  draft: [{ action: 'submit', label: 'Submit', variant: 'default' }],
  submitted: [
    { action: 'approve', label: 'Approve', variant: 'default' },
    { action: 'reject', label: 'Reject', variant: 'destructive' },
  ],
  approved: [
    { action: 'pay', label: 'Mark Paid', variant: 'default' },
    { action: 'cancel', label: 'Cancel', variant: 'destructive' },
  ],
  paid: [
    { action: 'close', label: 'Close', variant: 'outline' },
  ],
};

// ---------------------------------------------------------------------------
// Credit Note actions — mirrors CN_ACTION_TO_STATUS from transitions.ts
// ---------------------------------------------------------------------------

const CN_STATUS_ACTIONS: Record<string, ActionDef[]> = {
  received: [{ action: 'verify', label: 'Verify', variant: 'default' }],
  verified: [
    { action: 'apply', label: 'Apply to Budget', variant: 'default' },
    { action: 'dispute', label: 'Dispute', variant: 'destructive' },
    { action: 'cancel', label: 'Cancel', variant: 'destructive' },
  ],
  applied: [
    { action: 'close', label: 'Close', variant: 'outline' },
  ],
  disputed: [
    { action: 'verify', label: 'Re-verify', variant: 'default' },
    { action: 'cancel', label: 'Cancel', variant: 'destructive' },
  ],
};

const ACTIONS_MAP: Record<string, Record<string, ActionDef[]>> = {
  rfq: RFQ_STATUS_ACTIONS,
  quotation: QUOTATION_STATUS_ACTIONS,
  purchase_order: PO_STATUS_ACTIONS,
  supplier_invoice: SI_STATUS_ACTIONS,
  expense: EXPENSE_STATUS_ACTIONS,
  credit_note: CN_STATUS_ACTIONS,
};

/**
 * Maps transition action to the required permission suffix.
 * Mirrors packages/core/src/procurement/permission-map.ts exactly.
 * Duplicated client-side to avoid importing server code in 'use client'.
 */
const ACTION_TO_PERM_SUFFIX: Record<string, string> = {
  submit: 'submit', approve: 'approve', sign: 'sign', issue: 'issue',
  activate: 'activate', suspend: 'suspend', blacklist: 'blacklist',
  evaluate: 'evaluate', award: 'award', shortlist: 'shortlist',
  verify: 'verify', apply: 'apply', prepare_payment: 'prepare_payment',
  reject: 'review', return: 'review', review: 'review', receive_responses: 'review',
  terminate: 'terminate', supersede: 'terminate', expire: 'terminate',
  cancel: 'terminate', close: 'terminate',
};

function requiredPerm(resource: string, action: string): string {
  const suffix = ACTION_TO_PERM_SUFFIX[action];
  return suffix ? `${resource}.${suffix}` : `${resource}.edit`;
}

/**
 * Actions that are managed by the workflow engine when a workflow instance
 * is active. Hidden from the UI and blocked at the backend.
 */
const WORKFLOW_MANAGED_ACTIONS = ['approve', 'reject', 'return'];

/** Actions requiring a confirm dialog before execution. */
const CONFIRM_ACTIONS = ['approve', 'reject', 'return', 'cancel', 'close', 'expire', 'dispute', 'apply', 'pay'];

/** Actions requiring a comment (validated before confirm). */
const COMMENT_REQUIRED_ACTIONS = ['reject', 'return', 'dispute'];

type Props = {
  currentStatus: string;
  recordFamily: 'rfq' | 'quotation' | 'purchase_order' | 'supplier_invoice' | 'expense' | 'credit_note';
  /** Real user permissions from trpc.procurement.myPermissions. */
  userPermissions: string[];
  onTransition: (action: string, comment?: string) => Promise<void>;
  isLoading?: boolean;
  /** When true, approval-phase actions (approve/reject/return) are hidden — the workflow drives those. */
  hasActiveWorkflow?: boolean;
};

export function ProcurementTransitionActions({
  currentStatus,
  recordFamily,
  userPermissions,
  onTransition,
  isLoading,
  hasActiveWorkflow,
}: Props) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; label: string } | null>(null);
  const [comment, setComment] = useState('');

  const actionsMap = ACTIONS_MAP[recordFamily] ?? {};
  const rawActions = actionsMap[currentStatus] ?? [];
  // When a workflow controls the approval phase, filter out managed actions.
  const allActions = hasActiveWorkflow
    ? rawActions.filter(({ action }) => !WORKFLOW_MANAGED_ACTIONS.includes(action))
    : rawActions;

  const isAdmin = userPermissions.includes('system.admin');

  // Filter to only actions the user has permission for
  const actions = allActions.filter(({ action }) => {
    if (isAdmin) return true;
    return userPermissions.includes(requiredPerm(recordFamily, action));
  });

  // Detect whether workflow-managed actions were hidden this render
  const workflowHidActions = hasActiveWorkflow
    ? rawActions.filter(({ action }) => WORKFLOW_MANAGED_ACTIONS.includes(action))
    : [];

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

  // Show workflow explanation even when all visible actions were filtered out
  if (actions.length === 0 && workflowHidActions.length === 0) return null;

  return (
    <>
      <div className="space-y-2">
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map(({ action, label, variant }) => (
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
        )}

        {/* Explain hidden approval actions */}
        {workflowHidActions.length > 0 && (
          <p className="text-[11px] text-muted-foreground/70 flex items-start gap-1 max-w-xs text-right ml-auto">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              Approval, return, and rejection are handled by the approval workflow. Use the workflow steps to advance this record.
            </span>
          </p>
        )}

        {/* Re-submit context when returned */}
        {currentStatus === 'returned' && hasActiveWorkflow && (
          <p className="text-[11px] text-muted-foreground/70 flex items-start gap-1 max-w-xs text-right ml-auto">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              Re-submitting sends this back to the approver who returned it. The workflow continues from where it left off.
            </span>
          </p>
        )}
      </div>

      {/* Confirm dialog — matches commercial module pattern */}
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
              <Label htmlFor="procurement-transition-comment">
                Comment {COMMENT_REQUIRED_ACTIONS.includes(confirmAction?.action ?? '') ? '(required)' : '(optional)'}
              </Label>
              <textarea
                id="procurement-transition-comment"
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
                variant={['reject', 'cancel', 'expire'].includes(confirmAction?.action ?? '') ? 'destructive' : 'default'}
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

/** Exported for tests — the full action map per status. */
export { RFQ_STATUS_ACTIONS, QUOTATION_STATUS_ACTIONS, ACTION_TO_PERM_SUFFIX };
