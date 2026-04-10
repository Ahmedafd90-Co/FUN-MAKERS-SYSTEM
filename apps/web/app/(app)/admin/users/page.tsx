'use client';

import { useState } from 'react';
import { Toaster } from 'sonner';

import { UserFormDialog } from '@/components/admin/user-form';
import { UserList } from '@/components/admin/user-list';

export default function AdminUsersPage() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Toaster position="top-right" />
      <UserList onCreateClick={() => setCreateOpen(true)} />
      <UserFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
