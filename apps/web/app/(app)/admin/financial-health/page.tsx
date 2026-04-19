'use client';

/**
 * Admin > Financial Health — project-first reconciliation dashboard.
 *
 * Project picker → per-project three-way KPI comparison table.
 * No cross-project aggregation by design (Ahmed's correction #3).
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import {
  HeartPulse,
  Loader2,
  Search,
  ChevronLeft,
} from 'lucide-react';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';
import { statusBadgeStyle } from '@/lib/badge-variants';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { ReconciliationTable } from '@/components/admin/reconciliation-table';

// ---------------------------------------------------------------------------
// Project picker
// ---------------------------------------------------------------------------

function ProjectPicker({
  onSelect,
}: {
  onSelect: (project: { id: string; code: string; name: string }) => void;
}) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = trpc.reconciliation.projectList.useQuery(
    { search: search || undefined, take: 25 },
  );

  const projects = data?.projects ?? [];

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search projects by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <EmptyState
          icon={HeartPulse}
          title="No projects found"
          description={search ? 'Try a different search term.' : 'No projects exist yet.'}
        />
      )}

      {!isLoading && projects.length > 0 && (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Project</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Posting Events</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const style = statusBadgeStyle(p.status);
                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelect({ id: p.id, code: p.code, name: p.name })}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={style.variant} className={style.className}>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {p.postingEventCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 25 && (
        <p className="text-xs text-muted-foreground">
          Showing 25 of {data.total} projects. Use search to narrow results.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reconciliation view for a selected project
// ---------------------------------------------------------------------------

function ProjectReconciliation({
  project,
  onBack,
}: {
  project: { id: string; code: string; name: string };
  onBack: () => void;
}) {
  const { data, isLoading, error, refetch } = trpc.reconciliation.reconcileProject.useQuery(
    { projectId: project.id },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            {project.name}
          </h2>
          <p className="text-xs text-muted-foreground font-mono">{project.code}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Running reconciliation...
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">
            Reconciliation failed: {error.message}
          </p>
        </div>
      )}

      {data && <ReconciliationTable result={data} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinancialHealthPage() {
  const [selectedProject, setSelectedProject] = useState<{
    id: string;
    code: string;
    name: string;
  } | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Financial Health"
        description="Three-way reconciliation: source records vs posting ledger vs displayed KPIs. Select a project to verify."
      />

      {selectedProject ? (
        <ProjectReconciliation
          project={selectedProject}
          onBack={() => setSelectedProject(null)}
        />
      ) : (
        <ProjectPicker onSelect={setSelectedProject} />
      )}
    </div>
  );
}
