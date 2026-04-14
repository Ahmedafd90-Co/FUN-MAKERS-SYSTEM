'use client';

/**
 * EntityWorkflowDefaults — configure default workflow templates for an entity.
 *
 * Entity-level defaults apply to all projects under this entity unless
 * overridden at the project level. Stored in Entity.metadataJson.workflow_templates.
 *
 * Resolution order: Project override → Entity default → System fallback
 */

import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { Button } from '@fmksa/ui/components/button';
import { Separator } from '@fmksa/ui/components/separator';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Config — record type keys matching resolveTemplateCode
// ---------------------------------------------------------------------------

const RECORD_TYPE_KEYS = [
  { key: 'correspondence', label: 'Correspondence (generic)' },
  { key: 'correspondence:letter', label: 'Correspondence — Letter' },
  { key: 'correspondence:notice', label: 'Correspondence — Notice' },
  { key: 'correspondence:claim', label: 'Correspondence — Claim' },
  { key: 'correspondence:back_charge', label: 'Correspondence — Back Charge' },
  { key: 'rfq', label: 'RFQ' },
  { key: 'quotation', label: 'Quotation' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  entityId: string;
  entityCode: string;
  /** Current metadataJson from the entity record. */
  metadata: Record<string, unknown> | null;
};

export function EntityWorkflowDefaults({
  entityId,
  entityCode,
  metadata,
}: Props) {
  const utils = trpc.useUtils();

  // Fetch active templates
  const { data: templates, isLoading: templatesLoading } =
    trpc.workflow.templates.list.useQuery({ isActive: true });

  // Parse existing workflow_templates from metadata
  const existingDefaults =
    (metadata?.workflow_templates as Record<string, string>) ?? {};

  // Local state for all overrides
  const [values, setValues] = useState<Record<string, string>>({});

  // Sync from props on mount / metadata change
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const { key } of RECORD_TYPE_KEYS) {
      initial[key] = existingDefaults[key] ?? '';
    }
    setValues(initial);
  }, [metadata]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateMut = trpc.entities.update.useMutation({
    onSuccess: () => {
      toast.success('Entity workflow defaults saved.');
      utils.entities.list.invalidate();
      utils.entities.get.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSave() {
    // Build clean workflow_templates object (omit empty strings)
    const wfTemplates: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value) wfTemplates[key] = value;
    }

    // Merge into existing metadata (preserve other keys)
    const newMetadata = {
      ...(metadata ?? {}),
      workflow_templates: wfTemplates,
    };

    updateMut.mutate({
      id: entityId,
      metadata: newMetadata,
    });
  }

  // Check if anything changed
  const isDirty = RECORD_TYPE_KEYS.some(
    ({ key }) => (values[key] ?? '') !== (existingDefaults[key] ?? ''),
  );

  if (templatesLoading) {
    return (
      <p className="text-xs text-muted-foreground">
        Loading workflow templates...
      </p>
    );
  }

  const templateList = templates ?? [];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Workflow Template Defaults</p>
        <p className="text-[11px] text-muted-foreground">
          Default templates for all projects under {entityCode}. Projects can
          override these individually.
        </p>
      </div>

      <div className="space-y-2">
        {RECORD_TYPE_KEYS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-[180px] shrink-0 truncate">
              {label}
            </span>
            <Select
              value={values[key] ?? ''}
              onValueChange={(v) =>
                setValues((prev) => ({ ...prev, [key]: v }))
              }
            >
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="System default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  <span className="text-muted-foreground">System default</span>
                </SelectItem>
                {templateList.map((t) => (
                  <SelectItem key={t.id} value={t.code}>
                    {t.name}{' '}
                    <span className="text-muted-foreground text-[10px]">
                      ({t.code})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {isDirty && (
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={handleSave}
          disabled={updateMut.isPending}
        >
          {updateMut.isPending ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-3 w-3 mr-1" />
              Save Defaults
            </>
          )}
        </Button>
      )}
    </div>
  );
}
