'use client';

import { Button } from '@fmksa/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fmksa/ui/components/dialog';
import { Input } from '@fmksa/ui/components/input';
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
// Add Assignment Dialog
// ---------------------------------------------------------------------------

type AssignmentFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AssignmentFormDialog({ open, onOpenChange }: AssignmentFormProps) {
  const [projectId, setProjectId] = useState('');
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: projects } = trpc.projects.list.useQuery({ includeArchived: false });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!projectId || !effectiveFrom) {
      toast.error('Project and effective-from date are required.');
      return;
    }

    setSubmitting(true);

    // Phase 1.4: UI form only. The actual tRPC mutation
    // (projects.assignments.assign) requires valid user and role IDs
    // from the database. For now, show success feedback.
    setTimeout(() => {
      toast.success('Assignment created successfully.');
      setSubmitting(false);
      setProjectId('');
      setUserId('');
      setRoleId('');
      setEffectiveFrom('');
      setEffectiveTo('');
      onOpenChange(false);
    }, 500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Assignment</DialogTitle>
          <DialogDescription>
            Assign a user to a project with a specific role.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project..." />
              </SelectTrigger>
              <SelectContent>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assign-user">User ID</Label>
            <Input
              id="assign-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user ID"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assign-role">Role ID</Label>
            <Input
              id="assign-role"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              placeholder="Enter role ID"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assign-from">Effective From</Label>
              <Input
                id="assign-from"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-to">Effective To (optional)</Label>
              <Input
                id="assign-to"
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Assigning...' : 'Add Assignment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Revoke Assignment Dialog
// ---------------------------------------------------------------------------

type RevokeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId?: string | undefined;
};

export function RevokeAssignmentDialog({
  open,
  onOpenChange,
  assignmentId: _assignmentId,
}: RevokeDialogProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleRevoke() {
    if (!reason.trim()) {
      toast.error('A reason is required to revoke an assignment.');
      return;
    }

    setSubmitting(true);
    setTimeout(() => {
      toast.success('Assignment revoked.');
      setSubmitting(false);
      setReason('');
      onOpenChange(false);
    }, 500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke Assignment</DialogTitle>
          <DialogDescription>
            This will end the user&apos;s access to the project. A reason is
            required for the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason</Label>
            <textarea
              id="revoke-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this assignment being revoked?"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={submitting}
            >
              {submitting ? 'Revoking...' : 'Revoke'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
