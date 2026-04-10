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
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ProjectTeamTabProps = {
  projectId: string;
};

export function ProjectTeamTab({ projectId }: ProjectTeamTabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const { data: assignments, isLoading } = trpc.projects.assignments.list.useQuery({
    projectId,
  });

  const utils = trpc.useUtils();
  const revokeMutation = trpc.projects.assignments.revoke.useMutation({
    onSuccess: () => {
      toast.success('Assignment revoked.');
      utils.projects.assignments.list.invalidate();
      setRevokeId(null);
      setRevokeReason('');
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Current team members assigned to this project.
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Member
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Effective From</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Effective To</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading team...
                </td>
              </tr>
            ) : !assignments || assignments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No team members assigned to this project yet.
                </td>
              </tr>
            ) : (
              assignments.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{a.user.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs font-mono">
                      {a.role.code}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(a.effectiveFrom).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {a.effectiveTo
                      ? new Date(a.effectiveTo).toLocaleDateString()
                      : 'Indefinite'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive text-xs"
                      onClick={() => setRevokeId(a.id)}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add member dialog (simplified) */}
      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
      />

      {/* Revoke confirmation */}
      <Dialog open={!!revokeId} onOpenChange={(o) => !o && setRevokeId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke Assignment</DialogTitle>
            <DialogDescription>
              This will end the team member&apos;s access to this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-revoke-reason">Reason</Label>
              <textarea
                id="team-revoke-reason"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Why is this assignment being revoked?"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRevokeId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!revokeReason.trim()) {
                    toast.error('A reason is required.');
                    return;
                  }
                  if (revokeId) {
                    revokeMutation.mutate({
                      assignmentId: revokeId,
                      reason: revokeReason,
                    });
                  }
                }}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? 'Revoking...' : 'Revoke'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add member dialog
// ---------------------------------------------------------------------------

function AddMemberDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  const utils = trpc.useUtils();
  const assignMutation = trpc.projects.assignments.assign.useMutation({
    onSuccess: () => {
      toast.success('Team member added.');
      utils.projects.assignments.list.invalidate();
      setUserId('');
      setRoleId('');
      setEffectiveFrom('');
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim() || !roleId.trim() || !effectiveFrom) {
      toast.error('User ID, role ID, and effective-from date are required.');
      return;
    }
    assignMutation.mutate({
      projectId,
      userId,
      roleId,
      effectiveFrom: new Date(effectiveFrom),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>
            Assign a user to this project with a role.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-user-id">User ID</Label>
            <Input
              id="add-user-id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-role-id">Role ID</Label>
            <Input
              id="add-role-id"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              placeholder="Enter role ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-from">Effective From</Label>
            <Input
              id="add-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={assignMutation.isPending}>
              {assignMutation.isPending ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
