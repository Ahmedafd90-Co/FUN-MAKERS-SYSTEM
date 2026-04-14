'use client';

import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Separator } from '@fmksa/ui/components/separator';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';
import { WorkflowTemplateSettings } from './workflow-template-settings';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ProjectSettingsTabProps = {
  projectId: string;
};

export function ProjectSettingsTab({ projectId }: ProjectSettingsTabProps) {
  const { data: settings, isLoading } = trpc.projects.settings.getAll.useQuery({
    projectId,
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading settings...</p>;
  }

  if (!settings || Object.keys(settings).length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No project settings configured.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workflow template overrides — purpose-built UI */}
      <WorkflowTemplateSettings projectId={projectId} />

      <Separator />

      {/* Raw settings table */}
      {settings && Object.keys(settings).length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            All project settings (raw key-value pairs).
          </p>
          <SettingsEntries projectId={projectId} settings={settings} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable settings entries
// ---------------------------------------------------------------------------

function SettingsEntries({
  projectId,
  settings,
}: {
  projectId: string;
  settings: Record<string, unknown>;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Key</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Value</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(settings).map(([key, value]) => (
            <SettingRow key={key} projectId={projectId} settingKey={key} value={value} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingRow({
  projectId,
  settingKey,
  value,
}: {
  projectId: string;
  settingKey: string;
  value: unknown;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(JSON.stringify(value));

  const utils = trpc.useUtils();
  const setMutation = trpc.projects.settings.set.useMutation({
    onSuccess: () => {
      toast.success(`Setting "${settingKey}" updated.`);
      utils.projects.settings.getAll.invalidate();
      setEditing(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const displayValue =
    typeof value === 'boolean'
      ? value
        ? 'true'
        : 'false'
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);

  if (!editing) {
    return (
      <tr className="border-b last:border-0">
        <td className="px-4 py-2 font-mono text-xs">{settingKey}</td>
        <td className="px-4 py-2 text-muted-foreground">{displayValue}</td>
        <td className="px-4 py-2 text-right">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b last:border-0 bg-muted/20">
      <td className="px-4 py-2 font-mono text-xs">{settingKey}</td>
      <td className="px-4 py-2">
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="h-8 text-sm max-w-sm"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              try {
                const parsed = JSON.parse(editValue);
                setMutation.mutate({
                  projectId,
                  key: settingKey,
                  value: parsed,
                });
              } catch {
                // If not valid JSON, treat as string
                setMutation.mutate({
                  projectId,
                  key: settingKey,
                  value: editValue,
                });
              }
            }}
            disabled={setMutation.isPending}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => {
              setEditValue(JSON.stringify(value));
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  );
}
