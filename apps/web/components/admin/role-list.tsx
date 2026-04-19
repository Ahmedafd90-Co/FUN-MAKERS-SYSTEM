'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { ChevronDown, ChevronRight, Shield } from 'lucide-react';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';
import { PageHeader } from '@/components/layout/page-header';

// ---------------------------------------------------------------------------
// Component — DB-backed, read-only
// ---------------------------------------------------------------------------

export function RoleList() {
  const { data: roles, isLoading, error } = trpc.adminUsers.roleList.useQuery();
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Access"
        title="Roles & Permissions"
        description="Read-only view of system roles and their permission assignments."
      />

      {isLoading && (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading roles...</p>
      )}

      {error && (
        <p className="text-sm text-destructive py-8 text-center">{error.message}</p>
      )}

      {roles && roles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Shield className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">No roles found in the database.</p>
        </div>
      )}

      {roles && roles.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Permissions</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Type</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const isExpanded = expandedRole === role.id;
                const permissions = role.rolePermissions.map((rp) => rp.permission.code);

                return (
                  <RoleRow
                    key={role.id}
                    role={{ ...role, permissions }}
                    isExpanded={isExpanded}
                    onToggle={() =>
                      setExpandedRole(isExpanded ? null : role.id)
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role row with expandable permissions
// ---------------------------------------------------------------------------

type RoleDisplay = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
};

function RoleRow({
  role,
  isExpanded,
  onToggle,
}: {
  role: RoleDisplay;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-3 text-center">
          <Button variant="ghost" size="icon" className="h-6 w-6" tabIndex={-1}>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </td>
        <td className="px-4 py-3 font-medium">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            {role.name}
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
          {role.code}
        </td>
        <td className="px-4 py-3 text-muted-foreground">{role.description ?? '—'}</td>
        <td className="px-4 py-3 text-center">{role.permissions.length}</td>
        <td className="px-4 py-3 text-center">
          {role.isSystem ? (
            <Badge variant="secondary">System</Badge>
          ) : (
            <Badge variant="outline">Custom</Badge>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b bg-muted/20">
          <td />
          <td colSpan={5} className="px-4 py-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Permission Codes
              </p>
              {role.permissions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No permissions assigned.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {role.permissions.map((p) => (
                    <Badge key={p} variant="outline" className="font-mono text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
