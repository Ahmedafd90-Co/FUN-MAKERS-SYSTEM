import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';

import { PageHeader } from '@/components/layout/page-header';

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * New Project Participant — create page (Stage 1 placeholder).
 *
 * Stage 2 will render `<ProjectParticipantForm projectId={id} />` calling
 * `trpc.layer1.projectParticipants.create` with permission gating on
 * `project_participant.create`.
 */
export default async function NewProjectParticipantPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="space-y-4">
      <Link
        href={`/projects/${id}/participants`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Participants
      </Link>

      <PageHeader
        title="New Project Participant"
        description="Add an entity to this project."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Coming in Stage 2</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The participant create form will render here. Will use{' '}
          <code className="text-xs">trpc.layer1.projectParticipants.create</code>.
        </CardContent>
      </Card>
    </div>
  );
}
