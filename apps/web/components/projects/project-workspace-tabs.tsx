'use client';

import { Separator } from '@fmksa/ui/components/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@fmksa/ui/components/tabs';
import { useState } from 'react';

import { DocumentList } from '@/components/documents/document-list';
import { UploadWidget } from '@/components/documents/upload-widget';
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
};

// ---------------------------------------------------------------------------
// Placeholder tab content
// ---------------------------------------------------------------------------

function PlaceholderTab({ module }: { module: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-muted-foreground/70">
        Coming in {module}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ project }: { project: ProjectData }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Project Code</p>
            <p className="text-sm font-mono mt-0.5">{project.code}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Name</p>
            <p className="text-sm mt-0.5">{project.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Entity</p>
            <p className="text-sm mt-0.5">
              {project.entity ? `${project.entity.code} - ${project.entity.name}` : '-'}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type ProjectWorkspaceTabsProps = {
  project: ProjectData;
};

export function ProjectWorkspaceTabs({ project }: ProjectWorkspaceTabsProps) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        {/* Future module tabs — subtle, not noisy */}
        <TabsTrigger
          value="commercial"
          className="text-muted-foreground/50"
          title="Coming in Module 2"
        >
          Commercial
        </TabsTrigger>
        <TabsTrigger
          value="procurement"
          className="text-muted-foreground/50"
          title="Coming in Module 3"
        >
          Procurement
        </TabsTrigger>
        <TabsTrigger
          value="materials"
          className="text-muted-foreground/50"
          title="Coming in Module 3"
        >
          Materials
        </TabsTrigger>
        <TabsTrigger
          value="budget"
          className="text-muted-foreground/50"
          title="Coming in Module 4"
        >
          Budget
        </TabsTrigger>
        <TabsTrigger
          value="cashflow"
          className="text-muted-foreground/50"
          title="Coming in Module 4"
        >
          Cashflow
        </TabsTrigger>
      </TabsList>

      <Separator className="my-4" />

      <TabsContent value="overview">
        <OverviewTab project={project} />
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

      <TabsContent value="commercial">
        <PlaceholderTab module="Module 2" />
      </TabsContent>

      <TabsContent value="procurement">
        <PlaceholderTab module="Module 3" />
      </TabsContent>

      <TabsContent value="materials">
        <PlaceholderTab module="Module 3" />
      </TabsContent>

      <TabsContent value="budget">
        <PlaceholderTab module="Module 4" />
      </TabsContent>

      <TabsContent value="cashflow">
        <PlaceholderTab module="Module 4" />
      </TabsContent>
    </Tabs>
  );
}
