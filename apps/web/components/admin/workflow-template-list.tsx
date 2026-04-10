'use client';

/**
 * Workflow template list component — shows all templates with filters.
 *
 * Task 1.5.10
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type WorkflowTemplateListProps = {
  onCreateClick: () => void;
};

export function WorkflowTemplateList({
  onCreateClick,
}: WorkflowTemplateListProps) {
  const [recordTypeFilter, setRecordTypeFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const { data: templates, isLoading } = trpc.workflow.templates.list.useQuery(
    {
      recordType:
        recordTypeFilter !== 'all' ? recordTypeFilter : undefined,
      isActive:
        activeFilter === 'all'
          ? undefined
          : activeFilter === 'active',
    },
  );

  // Collect unique record types for the filter dropdown
  const recordTypes = Array.from(
    new Set((templates ?? []).map((t) => t.recordType)),
  ).sort();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Workflow Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage approval workflow templates. Each template defines an ordered
            sequence of approval steps.
          </p>
        </div>
        <Button onClick={onCreateClick} size="sm">
          <Plus className="h-4 w-4" />
          Create Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={recordTypeFilter} onValueChange={setRecordTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Record type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All record types</SelectItem>
            {recordTypes.map((rt) => (
              <SelectItem key={rt} value={rt}>
                {rt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading state */}
      {isLoading && (
        <p className="text-muted-foreground py-8 text-center">
          Loading templates...
        </p>
      )}

      {/* Empty state */}
      {!isLoading && (!templates || templates.length === 0) && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            No workflow templates found.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onCreateClick}
          >
            Create your first template
          </Button>
        </div>
      )}

      {/* Table */}
      {!isLoading && templates && templates.length > 0 && (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Code
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Record Type
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Version
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Steps
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tmpl) => (
                <tr
                  key={tmpl.id}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/workflow-templates/${tmpl.id}`}
                      className="font-mono text-xs font-medium text-foreground hover:underline"
                    >
                      {tmpl.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{tmpl.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{tmpl.recordType}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    v{tmpl.version}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {tmpl.steps?.length ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    {tmpl.isActive ? (
                      <Badge
                        variant="secondary"
                        className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
