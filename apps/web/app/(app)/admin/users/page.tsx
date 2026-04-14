'use client';

import { useState } from 'react';

import { UserFormDialog } from '@/components/admin/user-form';
import { UserList } from '@/components/admin/user-list';

export default function AdminUsersPage() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <UserList onCreateClick={() => setCreateOpen(true)} />
      <UserFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
