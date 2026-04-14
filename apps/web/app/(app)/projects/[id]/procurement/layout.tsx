import { prisma } from '@fmksa/db';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { ProcurementSidebar } from '@/components/procurement/procurement-sidebar';

export default async function ProcurementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch the project name for breadcrumb display
  const project = await prisma.project.findUnique({
    where: { id },
    select: { name: true },
  });

  const projectName = project?.name ?? 'Project';

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          { label: projectName, href: `/projects/${id}` },
          { label: 'Procurement' },
        ]}
      />
      <div className="flex gap-6">
        <ProcurementSidebar projectId={id} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
