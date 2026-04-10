import { PageHeader } from '@/components/layout/page-header';
import { ProjectList } from '@/components/projects/project-list';

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
      />
      <ProjectList />
    </div>
  );
}
