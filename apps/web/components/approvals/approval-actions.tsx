'use client';

/**
 * Approval action dialogs — Approve, Return, Reject.
 *
 * Task 1.5.11
 */

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Approval item shape (from myApprovals query)
// ---------------------------------------------------------------------------

type ApprovalItem = {
  instanceId: string;
  projectId: string;
  currentStepId: string;
  previousSteps: Array<{ id: string; name: string; orderIndex: number }>;
};

// ---------------------------------------------------------------------------
// Approve Dialog
// ---------------------------------------------------------------------------

type ApproveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ApprovalItem | null;
};

export function ApproveDialog({ open, onOpenChange, item }: ApproveDialogProps) {
  const [comment, setComment] = useState('');
  const utils = trpc.useUtils();

  const mutation = trpc.workflow.actions.approve.useMutation({
    onSuccess: () => {
      toast.success('Step approved.');
      utils.workflow.myApprovals.invalidate();
      setComment('');
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve Step</DialogTitle>
          <DialogDescription>
            Approve this workflow step. An optional comment can be provided.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="approve-comment">Comment (optional)</Label>
            <textarea
              id="approve-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Any notes about this approval..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                mutation.mutate({
                  projectId: item.projectId,
                  instanceId: item.instanceId,
                  stepId: item.currentStepId,
                  comment: comment || undefined,
                });
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reject Dialog
// ---------------------------------------------------------------------------

type RejectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ApprovalItem | null;
};

export function RejectDialog({ open, onOpenChange, item }: RejectDialogProps) {
  const [comment, setComment] = useState('');
  const utils = trpc.useUtils();

  const mutation = trpc.workflow.actions.reject.useMutation({
    onSuccess: () => {
      toast.success('Step rejected.');
      utils.workflow.myApprovals.invalidate();
      setComment('');
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Step</DialogTitle>
          <DialogDescription>
            Reject this workflow step. A comment explaining the reason is
            required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reject-comment">
              Comment <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="reject-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Reason for rejection..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!comment.trim()) {
                  toast.error('A comment is required for rejection.');
                  return;
                }
                mutation.mutate({
                  projectId: item.projectId,
                  instanceId: item.instanceId,
                  stepId: item.currentStepId,
                  comment,
                });
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Return Dialog
// ---------------------------------------------------------------------------

type ReturnDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ApprovalItem | null;
};

export function ReturnDialog({ open, onOpenChange, item }: ReturnDialogProps) {
  const [comment, setComment] = useState('');
  const [returnToStepId, setReturnToStepId] = useState<string>('');
  const utils = trpc.useUtils();

  const mutation = trpc.workflow.actions.return.useMutation({
    onSuccess: () => {
      toast.success('Step returned.');
      utils.workflow.myApprovals.invalidate();
      setComment('');
      setReturnToStepId('');
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Return Step</DialogTitle>
          <DialogDescription>
            Return this workflow to a previous step. A comment explaining the
            reason is required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="return-comment">
              Comment <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="return-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Reason for returning..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {/* Return-to step dropdown (optional) */}
          {item.previousSteps.length > 0 && (
            <div className="space-y-2">
              <Label>Return to Step (optional)</Label>
              <Select
                value={returnToStepId}
                onValueChange={setReturnToStepId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Default: previous step" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">
                    Default (previous step)
                  </SelectItem>
                  {item.previousSteps.map((step) => (
                    <SelectItem key={step.id} value={step.id}>
                      {step.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!comment.trim()) {
                  toast.error('A comment is required for return.');
                  return;
                }
                mutation.mutate({
                  projectId: item.projectId,
                  instanceId: item.instanceId,
                  stepId: item.currentStepId,
                  comment,
                  returnToStepId:
                    returnToStepId && returnToStepId !== 'default'
                      ? returnToStepId
                      : undefined,
                });
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Returning...' : 'Return'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
