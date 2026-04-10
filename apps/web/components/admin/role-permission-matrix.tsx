'use client';

/**
 * Role-Permission matrix — a read-only display of which screen permissions
 * are assigned to each role.
 *
 * Phase 1.4: Shows a static representation. A full interactive matrix
 * (checkbox-toggle) is a nice-to-have for a later phase.
 */

import { Badge } from '@fmksa/ui/components/badge';

// ---------------------------------------------------------------------------
// Screen permission definitions
// ---------------------------------------------------------------------------

type ScreenPermDef = {
  screenCode: string;
  label: string;
  roles: string[]; // role codes that have canView for this screen
};

const SCREEN_PERMISSIONS: ScreenPermDef[] = [
  {
    screenCode: 'admin_users',
    label: 'Admin: Users',
    roles: ['super_admin', 'company_admin'],
  },
  {
    screenCode: 'admin_roles_permissions',
    label: 'Admin: Roles & Permissions',
    roles: ['super_admin', 'company_admin'],
  },
  {
    screenCode: 'admin_entities',
    label: 'Admin: Entities',
    roles: ['super_admin', 'company_admin'],
  },
  {
    screenCode: 'admin_reference_data',
    label: 'Admin: Reference Data',
    roles: ['super_admin', 'company_admin'],
  },
  {
    screenCode: 'projects_list',
    label: 'Projects List',
    roles: ['super_admin', 'company_admin', 'project_director', 'project_manager', 'contracts_manager', 'procurement_manager', 'site_engineer', 'qaqc_engineer', 'document_controller', 'finance_manager', 'cost_engineer', 'planning_engineer', 'auditor', 'viewer'],
  },
  {
    screenCode: 'project_workspace',
    label: 'Project Workspace',
    roles: ['super_admin', 'project_director', 'project_manager', 'contracts_manager', 'procurement_manager', 'site_engineer', 'qaqc_engineer', 'document_controller', 'finance_manager', 'cost_engineer', 'planning_engineer', 'auditor', 'viewer'],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RolePermissionMatrix() {
  return (
    <div className="mt-8 space-y-4">
      <div>
        <h2 className="text-base font-medium">Screen Permissions</h2>
        <p className="text-sm text-muted-foreground">
          Read-only view of which roles can access each screen.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Screen</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Roles with Access</th>
            </tr>
          </thead>
          <tbody>
            {SCREEN_PERMISSIONS.map((sp) => (
              <tr key={sp.screenCode} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{sp.label}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {sp.roles.map((r) => (
                      <Badge key={r} variant="secondary" className="text-xs font-mono">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
