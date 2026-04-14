'use client';

import { useState } from 'react';

import { AssignmentFormDialog } from '@/components/admin/assignment-form';
import { AssignmentList } from '@/components/admin/assignment-list';

export default function AdminAssignmentsPage() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <AssignmentList onAddClick={() => setAddOpen(true)} />
      <AssignmentFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
