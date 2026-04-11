'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@fmksa/ui/components/command';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@fmksa/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { ChevronsUpDown, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
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

      {/* Add member dialog */}
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
// Add member dialog — with searchable user picker and role dropdown
// ---------------------------------------------------------------------------

type SelectedUser = {
  id: string;
  name: string;
  email: string;
};

function AddMemberDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  // User search state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);

  // Role state
  const [selectedRoleId, setSelectedRoleId] = useState('');

  // Date state
  const [effectiveFrom, setEffectiveFrom] = useState('');

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // User search query — only fires when search term is >= 2 chars
  const { data: searchResults, isFetching: isSearching } =
    trpc.projects.userSearch.useQuery(
      { query: debouncedSearch },
      { enabled: debouncedSearch.length >= 2 },
    );

  // Role list query
  const { data: roles } = trpc.projects.roleList.useQuery(undefined, {
    enabled: open,
  });

  const utils = trpc.useUtils();
  const assignMutation = trpc.projects.assignments.assign.useMutation({
    onSuccess: () => {
      toast.success('Team member added.');
      utils.projects.assignments.list.invalidate();
      resetForm();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function resetForm() {
    setSearch('');
    setDebouncedSearch('');
    setSelectedUser(null);
    setSelectedRoleId('');
    setEffectiveFrom('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) {
      toast.error('Please select a user.');
      return;
    }
    if (!selectedRoleId) {
      toast.error('Please select a role.');
      return;
    }
    if (!effectiveFrom) {
      toast.error('Effective-from date is required.');
      return;
    }
    assignMutation.mutate({
      projectId,
      userId: selectedUser.id,
      roleId: selectedRoleId,
      effectiveFrom: new Date(effectiveFrom),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>
            Search for a user and assign them a role on this project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* User picker (Combobox) */}
          <div className="space-y-2">
            <Label>User</Label>
            {selectedUser ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedUser.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{selectedUser.email}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setSelectedUser(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Popover open={userPopoverOpen} onOpenChange={setUserPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={userPopoverOpen}
                    className="w-full justify-between font-normal text-muted-foreground"
                  >
                    Search for a user...
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Type name or email..."
                      value={search}
                      onValueChange={setSearch}
                    />
                    <CommandList>
                      {debouncedSearch.length < 2 ? (
                        <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
                      ) : isSearching ? (
                        <CommandEmpty>Searching...</CommandEmpty>
                      ) : !searchResults || searchResults.length === 0 ? (
                        <CommandEmpty>No users found.</CommandEmpty>
                      ) : (
                        <CommandGroup>
                          {searchResults.map((user) => (
                            <CommandItem
                              key={user.id}
                              value={user.id}
                              onSelect={() => {
                                setSelectedUser({
                                  id: user.id,
                                  name: user.name,
                                  email: user.email,
                                });
                                setSearch('');
                                setUserPopoverOpen(false);
                              }}
                            >
                              <div className="flex items-center justify-between w-full gap-2">
                                <span className="truncate">{user.name}</span>
                                <span className="text-xs text-muted-foreground truncate">
                                  {user.email}
                                </span>
                              </div>
                              {user.status !== 'active' && (
                                <Badge variant="secondary" className="ml-2 text-[10px]">
                                  {user.status}
                                </Badge>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Role picker (Select dropdown) */}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles?.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name} ({role.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Effective From */}
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
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
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
