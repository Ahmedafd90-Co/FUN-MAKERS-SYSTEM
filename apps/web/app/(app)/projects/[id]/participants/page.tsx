import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';

import { PageHeader } from '@/components/layout/page-header';

/**
 * Project Participants — list page (Stage 1 placeholder).
 *
 * Stage 2 will wire this to `trpc.layer1.projectParticipants.list({ projectId })`
 * and render the participant register with create/edit/delete actions gated on
 * `project_participant.*` permissions.
 */
export default function ProjectParticipantsListPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Project Participants"
        description="Entities (companies / branches) participating in this project."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Coming in Stage 2</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The participant register will render here. Will use{' '}
          <code className="text-xs">trpc.layer1.projectParticipants.list</code> with
          permission gating on <code className="text-xs">project_participant.view</code>.
        </CardContent>
      </Card>
    </div>
  );
}
