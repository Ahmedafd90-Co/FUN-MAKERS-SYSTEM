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
import { UserPlus, UserMinus } from 'lucide-react';

// ---------------------------------------------------------------------------
// Add Assignment Dialog — honest placeholder
// ---------------------------------------------------------------------------

type AssignmentFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AssignmentFormDialog({ open, onOpenChange }: AssignmentFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Assignment</DialogTitle>
          <DialogDescription>
            Assign a user to a project with a specific role.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <UserPlus className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground max-w-xs">
            Project assignment management is not yet available in the UI.
            Assignments are currently managed through the database seed or
            direct API calls.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Revoke Assignment Dialog — honest placeholder
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke Assignment</DialogTitle>
          <DialogDescription>
            End a user&apos;s access to a project.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <UserMinus className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground max-w-xs">
            Assignment revocation is not yet available in the UI. Contact your
            system administrator or use the API directly.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
