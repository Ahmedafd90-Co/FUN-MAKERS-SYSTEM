'use client';

import { useState } from 'react';
import { Toaster } from 'sonner';

import { CreateEntityDialog, EntityDetailSheet } from '@/components/admin/entity-form';
import { EntityTree } from '@/components/admin/entity-tree';
import { trpc } from '@/lib/trpc-client';

type EntityData = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  parentEntityId: string | null;
  parent: { id: string; code: string; name: string } | null;
  children: EntityData[];
};

export default function AdminEntitiesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<EntityData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: entities, isLoading } = trpc.entities.list.useQuery({
    includeArchived: false,
  });

  function handleSelectEntity(entity: EntityData) {
    setSelectedEntity(entity);
    setDetailOpen(true);
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Loading entities...</p>;
  }

  // The entities from the API include parent/children relations. Cast for the
  // tree component.
  const entityList = (entities ?? []) as unknown as EntityData[];

  return (
    <>
      <Toaster position="top-right" />
      <EntityTree
        entities={entityList}
        onSelect={handleSelectEntity}
        onCreateClick={() => setCreateOpen(true)}
      />
      <CreateEntityDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        entities={entityList.map((e) => ({
          id: e.id,
          code: e.code,
          name: e.name,
          type: e.type,
        }))}
      />
      <EntityDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        entity={selectedEntity}
      />
    </>
  );
}
