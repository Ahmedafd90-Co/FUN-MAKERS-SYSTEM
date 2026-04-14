'use client';

/**
 * WorkflowTemplateSettings — configure workflow template overrides per project.
 *
 * Shows a row per record type with the currently assigned template (or "system
 * default") and a select dropdown to override. Uses the ProjectSetting key
 * convention `workflow_template:{recordType}` to match `resolveTemplateCode`.
 *
 * Subtype-specific overrides (e.g. `workflow_template:correspondence:claim`)
 * are supported through the "Correspondence subtypes" section.
 */

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { Button } from '@fmksa/ui/components/button';
import { Badge } from '@fmksa/ui/components/badge';
import { Loader2, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Record types that support workflow templates. */
const RECORD_TYPES = [
  { key: 'correspondence', label: 'Correspondence (generic)' },
  { key: 'correspondence:letter', label: 'Correspondence — Letter' },
  { key: 'correspondence:notice', label: 'Correspondence — Notice' },
  { key: 'correspondence:claim', label: 'Correspondence — Claim' },
  { key: 'correspondence:back_charge', label: 'Correspondence — Back Charge' },
  { key: 'rfq', label: 'RFQ' },
  { key: 'quotation', label: 'Quotation' },
] as const;

const SETTING_PREFIX = 'workflow_template:';

/** Sentinel value representing "no override / system default". Radix Select
 *  forbids value="" so we use a non-empty token and translate on save. */
const SYSTEM_DEFAULT = '__system_default__';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  projectId: string;
};

export function WorkflowTemplateSettings({ projectId }: Props) {
  const utils = trpc.useUtils();

  // All project settings (to detect existing overrides)
  const { data: allSettings, isLoading: settingsLoading } =
    trpc.projects.settings.getAll.useQuery({ projectId });

  // All active workflow templates
  const { data: templates, isLoading: templatesLoading } =
    trpc.workflow.templates.list.useQuery({ isActive: true });

  const setMutation = trpc.projects.settings.set.useMutation({
    onSuccess: () => {
      toast.success('Workflow template override saved.');
      utils.projects.settings.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (settingsLoading || templatesLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading workflow settings...
      </p>
    );
  }

  const templateList = templates ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Workflow Template Overrides</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Assign a specific workflow template to this project for each record
          type. When not set, the entity default or system default applies.
        </p>
      </div>

      <div className="rounded-md border divide-y">
        {RECORD_TYPES.map(({ key, label }) => (
          <TemplateOverrideRow
            key={key}
            projectId={projectId}
            settingKey={`${SETTING_PREFIX}${key}`}
            label={label}
            currentValue={
              allSettings?.[`${SETTING_PREFIX}${key}`] as string | undefined
            }
            templates={templateList}
            isSaving={setMutation.isPending}
            onSave={(value) => {
              setMutation.mutate({
                projectId,
                key: `${SETTING_PREFIX}${key}`,
                value,
              });
            }}
            onClear={() => {
              // Setting to empty string effectively removes the override
              // (resolveTemplateCode checks for truthy value)
              setMutation.mutate({
                projectId,
                key: `${SETTING_PREFIX}${key}`,
                value: '',
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

type TemplateData = {
  id: string;
  code: string;
  name: string;
  recordType: string;
  isActive: boolean;
};

function TemplateOverrideRow({
  projectId,
  settingKey,
  label,
  currentValue,
  templates,
  isSaving,
  onSave,
  onClear,
}: {
  projectId: string;
  settingKey: string;
  label: string;
  currentValue: string | undefined;
  templates: TemplateData[];
  isSaving: boolean;
  onSave: (value: string) => void;
  onClear: () => void;
}) {
  const [selected, setSelected] = useState<string>(currentValue || SYSTEM_DEFAULT);
  const hasOverride = !!currentValue;
  const isDirty = selected !== (currentValue || SYSTEM_DEFAULT);

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hasOverride ? (
          <p className="text-xs text-muted-foreground font-mono">
            Override: {currentValue}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Using default resolution
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-[220px] h-8 text-xs">
            <SelectValue placeholder="System default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SYSTEM_DEFAULT}>
              <span className="text-muted-foreground">System default</span>
            </SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.code}>
                {t.name}{' '}
                <span className="text-muted-foreground text-[10px]">
                  ({t.code})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isDirty && (
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={isSaving}
            onClick={() => {
              if (selected === SYSTEM_DEFAULT) {
                onClear();
              } else {
                onSave(selected);
              }
            }}
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
          </Button>
        )}

        {hasOverride && !isDirty && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            disabled={isSaving}
            onClick={onClear}
            title="Remove override"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
