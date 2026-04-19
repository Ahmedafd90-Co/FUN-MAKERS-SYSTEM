'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';
import { statusBadgeStyle } from '@/lib/badge-variants';
import { PageHeader } from '@/components/layout/page-header';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  const { variant, className } = statusBadgeStyle(status);
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge variant={variant} className={className}>{label}</Badge>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type UserListProps = {
  onCreateClick: () => void;
};

export function UserList({ onCreateClick }: UserListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Access"
        title="Users"
        description="Manage system users, their status, and role assignments."
        actions={
          <Button onClick={onCreateClick} size="sm">
            <Plus className="h-4 w-4" />
            Create User
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="locked">Locked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Roles</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Login</th>
            </tr>
          </thead>
          <tbody>
            <UserTableBody
              search={search}
              statusFilter={statusFilter}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table body — uses real admin tRPC query
// ---------------------------------------------------------------------------

function UserTableBody({
  search,
  statusFilter,
}: {
  search: string;
  statusFilter: string;
}) {
  const { data: users, isLoading } = trpc.adminUsers.userList.useQuery({
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter as 'active' | 'inactive' | 'locked' : undefined,
  });

  if (isLoading) {
    return (
      <tr>
        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
          Loading users...
        </td>
      </tr>
    );
  }

  if (!users || users.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
          No users match the current filters.
        </td>
      </tr>
    );
  }

  return (
    <>
      {users.map((user) => (
        <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
          <td className="px-4 py-3">
            <Link
              href={`/admin/users/${user.id}`}
              className="font-medium text-foreground hover:underline"
            >
              {user.name}
            </Link>
          </td>
          <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
          <td className="px-4 py-3">{statusBadge(user.status)}</td>
          <td className="px-4 py-3 text-muted-foreground">
            {user.userRoles?.length ?? 0} {(user.userRoles?.length ?? 0) === 1 ? 'role' : 'roles'}
          </td>
          <td className="px-4 py-3 text-muted-foreground">
            {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : '-'}
          </td>
        </tr>
      ))}
    </>
  );
}
