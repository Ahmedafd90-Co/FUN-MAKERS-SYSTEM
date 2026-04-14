'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@fmksa/ui/components/button';

import { CreateProjectDialog } from './create-project-dialog';

/**
 * Client-only wrapper for the Create Project button + dialog.
 * Used from the server-rendered projects page.
 */
export function CreateProjectButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Create Project
      </Button>
      <CreateProjectDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
