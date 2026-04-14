'use client';

/**
 * Admin > Workflow Templates — list and create templates.
 * Task 1.5.10
 */

import { useState } from 'react';

import { CreateTemplateDialog } from '@/components/admin/workflow-template-form';
import { WorkflowTemplateList } from '@/components/admin/workflow-template-list';

export default function WorkflowTemplatesPage() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <WorkflowTemplateList onCreateClick={() => setCreateOpen(true)} />
      <CreateTemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  );
}
