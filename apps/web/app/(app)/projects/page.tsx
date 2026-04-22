import { PageHeader } from '@/components/layout/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { CreateProjectButton } from '@/components/projects/create-project-button';
import { ExportMenu } from '@/components/common/export-menu';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects — Pico Play Fun Makers KSA',
};

export default function ProjectsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 space-y-4">
      <PageHeader
        title="Projects"
        description="Projects you are assigned to. Click a card to open the project workspace."
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu
              endpoint="/api/exports/monthly-cost-sheet"
              label="Monthly Cost Sheet"
            />
            <CreateProjectButton />
          </div>
        }
      />
      <ProjectList />
    </div>
  );
}
