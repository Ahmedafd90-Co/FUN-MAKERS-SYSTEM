'use client';

import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@fmksa/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';
import { Separator } from '@fmksa/ui/components/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@fmksa/ui/components/tabs';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';
import { DocumentList } from '@/components/documents/document-list';
import { UploadWidget } from '@/components/documents/upload-widget';

import { BudgetOverviewCard } from './budget-overview-card';
import { FinancialBaselineCard } from './financial-baseline-card';
import { PrimeContractTab } from './prime-contract-tab';
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
// Participants tab — discoverability surface; the actual list lives at
// /projects/[id]/participants/. Renders a count + CTA so users find it without
// needing to type the URL.
// ---------------------------------------------------------------------------

function ParticipantsTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = trpc.layer1.projectParticipants.list.useQuery({
    projectId,
  });

  const count = data?.length ?? 0;
  const summary = isLoading
    ? 'Loading participants...'
    : count === 0
      ? 'No participants assigned to this project yet.'
      : `${count} participant${count === 1 ? '' : 's'} assigned to this project.`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Project Participants</CardTitle>
        <p className="text-xs text-muted-foreground">
          Manage entities (companies / branches) involved in this project.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{summary}</p>
        <Button size="sm" asChild>
          <Link href={`/projects/${projectId}/participants`}>
            Manage Participants
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
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

  // Permission gate for the Participants tab. Aligns with the list query's
  // server-side gate (project_participant.view): the tab content immediately
  // calls projectParticipants.list, so a gate that admits 'create'-only users
  // would render the tab but then 403 the list query and fall through to
  // misleading "No participants assigned" copy. Tightened to require view.
  //
  // system.admin is intentionally NOT special-cased here — the layer1
  // myPermissions query filters by prefix and won't surface system.admin in
  // its return set; admin users get project_participant.view through their
  // role assignments and pass via the same code path.
  const { data: participantPerms } = trpc.layer1.projectParticipants.myPermissions.useQuery();
  const canViewParticipants =
    (participantPerms ?? []).includes('project_participant.view');

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
        {canViewParticipants && (
          <TabsTrigger value="participants">Participants</TabsTrigger>
        )}
        <TabsTrigger value="prime-contract">Prime Contract</TabsTrigger>
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
        <Link
          href={`/projects/${project.id}/budget`}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          Budget
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
        {['Materials', 'Cashflow'].map((label) => (
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

      {canViewParticipants && (
        <TabsContent value="participants">
          <ParticipantsTab projectId={project.id} />
        </TabsContent>
      )}

      <TabsContent value="prime-contract">
        <PrimeContractTab projectId={project.id} />
      </TabsContent>

      <TabsContent value="settings">
        <ProjectSettingsTab projectId={project.id} />
      </TabsContent>
    </Tabs>
  );
}
