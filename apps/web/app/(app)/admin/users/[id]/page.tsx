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
import { Separator } from '@fmksa/ui/components/separator';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Active</Badge>;
    case 'inactive':
      return <Badge variant="secondary" className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">Inactive</Badge>;
    case 'locked':
      return <Badge variant="destructive">Locked</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const { data: user, isLoading, error } = trpc.adminUsers.getUser.useQuery(
    { id: params.id },
  );

  const deactivateMut = trpc.adminUsers.deactivateUser.useMutation({
    onSuccess: (data) => {
      toast.success(`User "${data.name}" has been deactivated.`);
      setDeactivateOpen(false);
      utils.adminUsers.getUser.invalidate({ id: params.id });
      utils.adminUsers.userList.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading user details...</p>;
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Link>
        <p className="text-sm text-destructive">
          {error?.message ?? 'Unable to load user data.'}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Back link */}
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Users
      </Link>

      {/* Profile section */}
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{user.name}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(user.status)}
            {user.status === 'active' && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => setDeactivateOpen(true)}
              >
                Deactivate
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* Role assignments */}
        <div>
          <h2 className="text-base font-medium mb-3">Role Assignments</h2>
          {user.roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No roles assigned to this user.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Role</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Code</th>
                  </tr>
                </thead>
                <tbody>
                  {user.roles.map((role) => (
                    <tr key={role.id} className="border-b last:border-0">
                      <td className="px-4 py-2">{role.name}</td>
                      <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{role.code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Separator />

        {/* Permission codes */}
        <div>
          <h2 className="text-base font-medium mb-3">Effective Permissions</h2>
          {user.permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No permissions resolved for this user.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {user.permissions.map((p) => (
                <Badge key={p} variant="outline" className="font-mono text-xs">
                  {p}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Deactivate confirmation dialog */}
      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate User</DialogTitle>
            <DialogDescription>
              This will set the user&apos;s status to inactive. They will no
              longer be able to sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deactivateMut.mutate({ id: user.id })}
              disabled={deactivateMut.isPending}
            >
              {deactivateMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Deactivating...
                </>
              ) : (
                'Deactivate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
