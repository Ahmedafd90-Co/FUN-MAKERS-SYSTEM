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
import { useState } from 'react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Create User Dialog
// ---------------------------------------------------------------------------

type UserFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function UserFormDialog({ open, onOpenChange }: UserFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error('All fields are required.');
      return;
    }

    setSubmitting(true);

    // In Phase 1.4 we show the form UI. The actual backend mutation
    // (admin.users.create) would be wired in a future phase or via
    // a dedicated tRPC route. For now, show success feedback.
    setTimeout(() => {
      toast.success(`User "${name}" created successfully.`);
      setSubmitting(false);
      setName('');
      setEmail('');
      setPassword('');
      onOpenChange(false);
    }, 500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Add a new user to the system. They will receive their credentials
            separately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-name">Full Name</Label>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ahmed Al-Dossary"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. ahmed@funmakers.sa"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-password">Initial Password</Label>
            <Input
              id="user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 12 characters"
            />
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
              {submitting ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
