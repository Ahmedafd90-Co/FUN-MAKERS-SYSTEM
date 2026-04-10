import { ProjectList } from '@/components/projects/project-list';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects — Pico Play Fun Makers KSA',
};

export default function ProjectsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">
          Projects you are assigned to. Click a card to open the project
          workspace.
        </p>
      </div>
      <ProjectList />
    </div>
  );
}
