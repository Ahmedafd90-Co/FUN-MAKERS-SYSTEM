'use client';

import { useState } from 'react';
import { Toaster } from 'sonner';

import { AssignmentFormDialog } from '@/components/admin/assignment-form';
import { AssignmentList } from '@/components/admin/assignment-list';

export default function AdminAssignmentsPage() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <Toaster position="top-right" />
      <AssignmentList onAddClick={() => setAddOpen(true)} />
      <AssignmentFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
