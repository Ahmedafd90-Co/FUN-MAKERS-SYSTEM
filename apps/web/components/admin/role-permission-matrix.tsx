'use client';

/**
 * Role-Permission matrix — a read-only, DB-backed display of which
 * permission codes are assigned to each role.
 */

import { Badge } from '@fmksa/ui/components/badge';
import { trpc } from '@/lib/trpc-client';

export function RolePermissionMatrix() {
  const { data: roles, isLoading } = trpc.adminUsers.roleList.useQuery();

  if (isLoading || !roles) return null;

  // Build a deduplicated list of all permission codes across all roles
  const allPermCodes = [...new Set(
    roles.flatMap((r) => r.rolePermissions.map((rp) => rp.permission.code)),
  )].sort();

  if (allPermCodes.length === 0) return null;

  return (
    <div className="mt-8 space-y-4">
      <div>
        <h2 className="text-base font-medium">Permission Matrix</h2>
        <p className="text-sm text-muted-foreground">
          Read-only view of which permissions are assigned to each role.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground sticky left-0 bg-muted/50">Permission</th>
              {roles.map((role) => (
                <th
                  key={role.id}
                  className="px-3 py-3 text-center font-medium text-muted-foreground whitespace-nowrap"
                >
                  {role.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allPermCodes.map((permCode) => (
              <tr key={permCode} className="border-b last:border-0">
                <td className="px-4 py-2 font-mono text-xs sticky left-0 bg-card">
                  {permCode}
                </td>
                {roles.map((role) => {
                  const has = role.rolePermissions.some((rp) => rp.permission.code === permCode);
                  return (
                    <td key={role.id} className="px-3 py-2 text-center">
                      {has ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5">Yes</Badge>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
