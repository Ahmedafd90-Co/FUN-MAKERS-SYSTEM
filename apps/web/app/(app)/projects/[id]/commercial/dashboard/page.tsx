'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { DashboardCards } from '@/components/commercial/dashboard-cards';
import { ExportMenu } from '@/components/common/export-menu';

export default function CommercialDashboardPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Commercial Dashboard"
          description="Overview of commercial activities"
        />
        {/* Export — XLSX has Financial KPIs / Forecast Periods / Register
            Summary / Variations sheets. CSV flattens to Financial KPIs. */}
        <div className="pt-1">
          <ExportMenu
            endpoint="/api/exports/commercial"
            query={{ projectId: params.id }}
            label="Export"
          />
        </div>
      </div>
      <DashboardCards projectId={params.id} />
    </div>
  );
}
