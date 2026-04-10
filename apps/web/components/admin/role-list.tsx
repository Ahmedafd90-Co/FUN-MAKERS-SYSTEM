'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { ChevronDown, ChevronRight, Shield } from 'lucide-react';
import { useState } from 'react';

// ---------------------------------------------------------------------------
// Static role data — matches the 14 canonical roles from the spec.
// In production these would come from a tRPC query.
// ---------------------------------------------------------------------------

type RoleDef = {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
};

const ROLES: RoleDef[] = [
  {
    id: '1', code: 'super_admin', name: 'Super Admin',
    description: 'Full system access. Cannot be modified.',
    isSystem: true,
    permissions: ['system.admin', 'user.admin', 'user.edit', 'entity.view', 'entity.edit', 'project.create', 'project.edit', 'project.archive', 'reference_data.view', 'reference_data.edit', 'cross_project.read', 'document.upload', 'document.approve', 'workflow.manage'],
  },
  {
    id: '2', code: 'company_admin', name: 'Company Admin',
    description: 'Manages entities, users, and reference data.',
    isSystem: true,
    permissions: ['user.admin', 'user.edit', 'entity.view', 'entity.edit', 'reference_data.view', 'reference_data.edit', 'cross_project.read'],
  },
  {
    id: '3', code: 'project_director', name: 'Project Director',
    description: 'Oversees multiple projects across the organization.',
    isSystem: true,
    permissions: ['project.create', 'project.edit', 'project.archive', 'cross_project.read', 'document.upload', 'document.approve', 'workflow.manage'],
  },
  {
    id: '4', code: 'project_manager', name: 'Project Manager',
    description: 'Manages a single project end-to-end.',
    isSystem: false,
    permissions: ['project.edit', 'document.upload', 'document.approve', 'workflow.manage'],
  },
  {
    id: '5', code: 'contracts_manager', name: 'Contracts Manager',
    description: 'Handles contract documents and commercial operations.',
    isSystem: false,
    permissions: ['document.upload', 'document.approve'],
  },
  {
    id: '6', code: 'procurement_manager', name: 'Procurement Manager',
    description: 'Manages procurement workflows and vendor relations.',
    isSystem: false,
    permissions: ['document.upload', 'document.approve'],
  },
  {
    id: '7', code: 'site_engineer', name: 'Site Engineer',
    description: 'On-site technical operations and material tracking.',
    isSystem: false,
    permissions: ['document.upload'],
  },
  {
    id: '8', code: 'qaqc_engineer', name: 'QA/QC Engineer',
    description: 'Quality assurance and quality control reviews.',
    isSystem: false,
    permissions: ['document.upload', 'document.approve'],
  },
  {
    id: '9', code: 'document_controller', name: 'Document Controller',
    description: 'Manages the document library and metadata.',
    isSystem: false,
    permissions: ['document.upload', 'document.approve'],
  },
  {
    id: '10', code: 'finance_manager', name: 'Finance Manager',
    description: 'Budget, cashflow, and financial reporting.',
    isSystem: false,
    permissions: ['reference_data.view'],
  },
  {
    id: '11', code: 'cost_engineer', name: 'Cost Engineer',
    description: 'Cost tracking and variation analysis.',
    isSystem: false,
    permissions: ['reference_data.view'],
  },
  {
    id: '12', code: 'planning_engineer', name: 'Planning Engineer',
    description: 'Project scheduling and progress tracking.',
    isSystem: false,
    permissions: ['document.upload'],
  },
  {
    id: '13', code: 'auditor', name: 'Auditor',
    description: 'Read-only access to audit logs and compliance data.',
    isSystem: true,
    permissions: ['cross_project.read', 'reference_data.view'],
  },
  {
    id: '14', code: 'viewer', name: 'Viewer',
    description: 'Read-only access to assigned project data.',
    isSystem: false,
    permissions: ['reference_data.view'],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoleList() {
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground">
          View the 14 system roles and their permission assignments.
        </p>
      </div>

      {/* Role table */}
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
            {ROLES.map((role) => {
              const isExpanded = expandedRole === role.id;

              return (
                <RoleRow
                  key={role.id}
                  role={role}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role row with expandable permissions
// ---------------------------------------------------------------------------

function RoleRow({
  role,
  isExpanded,
  onToggle,
}: {
  role: RoleDef;
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
        <td className="px-4 py-3 text-muted-foreground">{role.description}</td>
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
              <div className="flex flex-wrap gap-1.5">
                {role.permissions.map((p) => (
                  <Badge key={p} variant="outline" className="font-mono text-xs">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
