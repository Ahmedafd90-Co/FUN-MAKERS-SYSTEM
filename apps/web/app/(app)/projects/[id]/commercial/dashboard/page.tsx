'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { DashboardCards } from '@/components/commercial/dashboard-cards';

export default function CommercialDashboardPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commercial"
        title="Commercial Dashboard"
        description="Overview of commercial activities"
      />
      <DashboardCards projectId={params.id} />
    </div>
  );
}
