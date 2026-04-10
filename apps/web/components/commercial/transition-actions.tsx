'use client';

import { Button } from '@fmksa/ui/components/button';
import { useState } from 'react';

// Maps status → allowed actions for display
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
};

type Props = {
  currentStatus: string;
  recordFamily: string;
  permissions: string[];
  onTransition: (action: string, comment?: string) => Promise<void>;
  isLoading?: boolean;
  extraActions?: Array<{ action: string; label: string; variant?: 'default' | 'destructive' | 'outline' | 'secondary' }>;
};

export function TransitionActions({ currentStatus, recordFamily, permissions, onTransition, isLoading, extraActions }: Props) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const baseActions = STATUS_ACTIONS[currentStatus] ?? [];
  const allActions = [...baseActions, ...(extraActions ?? [])];

  // Filter by permission
  const hasTransitionPerm = permissions.includes(`${recordFamily}.transition`);
  if (!hasTransitionPerm || allActions.length === 0) return null;

  const handleClick = async (action: string) => {
    setLoadingAction(action);
    try {
      await onTransition(action);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {allActions.map(({ action, label, variant }) => (
        <Button
          key={action}
          size="sm"
          variant={variant ?? 'outline'}
          disabled={isLoading || loadingAction !== null}
          onClick={() => handleClick(action)}
        >
          {loadingAction === action ? 'Processing...' : label}
        </Button>
      ))}
    </div>
  );
}
