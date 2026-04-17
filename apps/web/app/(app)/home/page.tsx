'use client';

import { PageHeader } from '@/components/layout/page-header';
import { DashboardCards } from '@/components/dashboard/dashboard-cards';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Dashboard"
        description="Operations overview"
      />
      <DashboardCards />
    </div>
  );
}
