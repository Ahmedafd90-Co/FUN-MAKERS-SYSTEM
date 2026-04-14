'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { useState } from 'react';

import { statusBadgeStyle } from '@/lib/badge-variants';

// ---------------------------------------------------------------------------
// Types — matching Prisma Entity shape from the entities router
// ---------------------------------------------------------------------------

type Entity = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  parentEntityId: string | null;
  parent: { id: string; code: string; name: string } | null;
  children: Entity[];
};

// ---------------------------------------------------------------------------
// Type badge
// ---------------------------------------------------------------------------

function typeBadge(type: string) {
  const labels: Record<string, string> = {
    parent: 'Parent',
    subsidiary: 'Subsidiary',
    sister_company: 'Sister Company',
    branch: 'Branch',
    operating_unit: 'Operating Unit',
    shared_service_entity: 'Shared Service',
  };
  return (
    <Badge variant="outline" className="text-xs">
      {labels[type] ?? type}
    </Badge>
  );
}

function statusBadge(status: string) {
  const { variant, className } = statusBadgeStyle(status);
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge variant={variant} className={`${className ?? ''} text-xs`.trim()}>{label}</Badge>;
}

// ---------------------------------------------------------------------------
// Tree node
// ---------------------------------------------------------------------------

function EntityNode({
  entity,
  depth,
  onSelect,
}: {
  entity: Entity;
  depth: number;
  onSelect: (entity: Entity) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = (entity.children?.length ?? 0) > 0;

  return (
    <>
      <tr
        className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => onSelect(entity)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center" style={{ paddingLeft: `${depth * 24}px` }}>
            {hasChildren ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 mr-2 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : (
              <span className="w-5 mr-2 shrink-0" />
            )}
            <Building2 className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
            <span className="font-medium">{entity.name}</span>
          </div>
        </td>
        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{entity.code}</td>
        <td className="px-4 py-3">{typeBadge(entity.type)}</td>
        <td className="px-4 py-3">{statusBadge(entity.status)}</td>
      </tr>
      {hasChildren && expanded &&
        (entity.children ?? []).map((child) => (
          <EntityNode
            key={child.id}
            entity={child}
            depth={depth + 1}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type EntityTreeProps = {
  entities: Entity[];
  onSelect: (entity: Entity) => void;
  onCreateClick: () => void;
};

export function EntityTree({ entities, onSelect, onCreateClick }: EntityTreeProps) {
  // Build tree from the flat list so all nesting levels have children populated.
  // Prisma's `include: { children: true }` only populates one level deep, which
  // causes crashes when EntityNode recurses into grandchildren.
  const nodeMap = new Map<string, Entity>();
  for (const e of entities) {
    nodeMap.set(e.id, { ...e, children: [] });
  }
  for (const e of entities) {
    if (e.parentEntityId && nodeMap.has(e.parentEntityId)) {
      nodeMap.get(e.parentEntityId)!.children.push(nodeMap.get(e.id)!);
    }
  }
  const roots = entities
    .filter((e) => !e.parentEntityId)
    .map((e) => nodeMap.get(e.id)!);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Entities</h1>
          <p className="text-sm text-muted-foreground">
            Multi-entity hierarchy. Click an entity to view or edit details.
          </p>
        </div>
        <Button onClick={onCreateClick} size="sm">
          Create Entity
        </Button>
      </div>

      {/* Tree table */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {roots.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No entities found. Create your first entity to get started.
                </td>
              </tr>
            ) : (
              roots.map((root) => (
                <EntityNode
                  key={root.id}
                  entity={root}
                  depth={0}
                  onSelect={onSelect}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
