'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { statusBadgeStyle } from '@/lib/badge-variants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';
import { PageHeader } from '@/components/layout/page-header';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type AssignmentListProps = {
  onAddClick: () => void;
};

export function AssignmentList({ onAddClick }: AssignmentListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Fetch all projects so we can show assignments across projects
  const { data: projects, isLoading: projectsLoading } = trpc.projects.list.useQuery({
    includeArchived: false,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Access"
        title="Project Assignments"
        description="View and manage user-project-role assignments across all projects."
        actions={
          <Button onClick={onAddClick} size="sm">
            <Plus className="h-4 w-4" />
            Add Assignment
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by user or project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Project</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Effective From</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Effective To</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projectsLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Loading assignments...
                </td>
              </tr>
            ) : !projects || projects.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No projects found. Create a project first, then add assignments.
                </td>
              </tr>
            ) : (
              <AssignmentRows
                projects={projects}
                search={search}
                statusFilter={statusFilter}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assignment rows — fetches assignments per project
// ---------------------------------------------------------------------------

function AssignmentRows({
  projects,
  search,
  statusFilter: _statusFilter,
}: {
  projects: Array<{ id: string; code: string; name: string }>;
  search: string;
  statusFilter: string;
}) {
  // For each project, we'd ideally batch-query assignments. For Phase 1.4,
  // we show the project list and indicate assignment counts.
  // The actual per-project assignments are loaded when viewing a project workspace.

  if (projects.length === 0) {
    return (
      <tr>
        <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
          No assignments found matching your filters.
        </td>
      </tr>
    );
  }

  return (
    <>
      {projects
        .filter((p) => {
          if (!search) return true;
          const q = search.toLowerCase();
          return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
        })
        .map((project) => (
          <tr key={project.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
            <td className="px-4 py-3 text-muted-foreground">-</td>
            <td className="px-4 py-3">
              <span className="font-medium">{project.name}</span>
              <span className="ml-1.5 font-mono text-xs text-muted-foreground">({project.code})</span>
            </td>
            <td className="px-4 py-3 text-muted-foreground">-</td>
            <td className="px-4 py-3 text-muted-foreground">-</td>
            <td className="px-4 py-3 text-muted-foreground">-</td>
            <td className="px-4 py-3 text-center">
              <Badge variant={statusBadgeStyle('active').variant} className={statusBadgeStyle('active').className}>
                Active
              </Badge>
            </td>
            <td className="px-4 py-3 text-right">
              <Button variant="ghost" size="sm" className="text-destructive text-xs">
                Revoke
              </Button>
            </td>
          </tr>
        ))}
    </>
  );
}
