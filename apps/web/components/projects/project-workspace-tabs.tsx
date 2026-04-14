'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Separator } from '@fmksa/ui/components/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@fmksa/ui/components/tabs';
import { useState } from 'react';

import { DocumentList } from '@/components/documents/document-list';
import { UploadWidget } from '@/components/documents/upload-widget';

import { BudgetOverviewCard } from './budget-overview-card';
import { FinancialBaselineCard } from './financial-baseline-card';
import { ProjectSettingsTab } from './project-settings-tab';
import { ProjectTeamTab } from './project-team-tab';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProjectData = {
  id: string;
  code: string;
  name: string;
  status: string;
  currencyCode: string;
  startDate: string;
  endDate: string | null;
  entity: { id: string; name: string; code: string } | null;
  currency: { code: string; name: string; symbol: string } | null;
  contractValue: string | number | null;
  revisedContractValue: string | number | null;
};

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ project, canEditProject }: { project: ProjectData; canEditProject: boolean }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Name</p>
            <p className="text-sm mt-0.5">{project.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Project Code</p>
            <p className="text-sm font-mono mt-0.5">{project.code}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Entity</p>
            <p className="text-sm mt-0.5">
              {project.entity ? (
                <>
                  {project.entity.name}{' '}
                  <span className="font-mono text-xs text-muted-foreground">({project.entity.code})</span>
                </>
              ) : '-'}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Currency</p>
            <p className="text-sm font-mono mt-0.5">
              {project.currency ? `${project.currency.code} (${project.currency.symbol})` : project.currencyCode}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Start Date</p>
            <p className="text-sm mt-0.5">
              {new Date(project.startDate).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">End Date</p>
            <p className="text-sm mt-0.5">
              {project.endDate
                ? new Date(project.endDate).toLocaleDateString()
                : 'Not set'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
            <p className="text-sm mt-0.5 capitalize">{project.status}</p>
          </div>
        </div>
      </div>

      {/* ── Financial Baseline (external contract value) ── */}
      <FinancialBaselineCard
        projectId={project.id}
        contractValue={project.contractValue}
        revisedContractValue={project.revisedContractValue}
        currency={project.currency?.code ?? project.currencyCode}
        currencySymbol={project.currency?.symbol ?? project.currencyCode}
        canEdit={canEditProject}
      />

      {/* ── Internal Budget ── */}
      <BudgetOverviewCard
        projectId={project.id}
        currency={project.currency?.code ?? project.currencyCode}
        currencySymbol={project.currency?.symbol ?? project.currencyCode}
        canEdit={canEditProject}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type ProjectWorkspaceTabsProps = {
  project: ProjectData;
  /** Whether the current user holds project.edit permission */
  canEditProject: boolean;
};

export function ProjectWorkspaceTabs({ project, canEditProject }: ProjectWorkspaceTabsProps) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      {/* Module navigation links — visually distinct from content tabs */}
      <div className="flex items-center gap-2 mt-2">
        <Link
          href={`/projects/${project.id}/commercial`}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          Commercial
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
        <Link
          href={`/projects/${project.id}/procurement`}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          Procurement
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
        {['Materials', 'Budget', 'Cashflow'].map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground/50 cursor-default"
            title={`${label} — coming soon`}
          >
            {label}
          </span>
        ))}
      </div>

      <Separator className="my-4" />

      <TabsContent value="overview">
        <OverviewTab project={project} canEditProject={canEditProject} />
      </TabsContent>

      <TabsContent value="documents">
        <DocumentList
          projectId={project.id}
          onUploadClick={() => setUploadOpen(true)}
        />
        <UploadWidget
          projectId={project.id}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
        />
      </TabsContent>

      <TabsContent value="team">
        <ProjectTeamTab projectId={project.id} />
      </TabsContent>

      <TabsContent value="settings">
        <ProjectSettingsTab projectId={project.id} />
      </TabsContent>
    </Tabs>
  );
}
