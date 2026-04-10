'use client';

/**
 * Workflow template create/edit form.
 *
 * Form-based JSON template editor with validation (not a visual designer).
 * Task 1.5.10
 */

import { Button } from '@fmksa/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fmksa/ui/components/dialog';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';
import {
  WorkflowStepEditor,
  createEmptyStep,
  stepsToPayload,
  type StepDraft,
} from './workflow-step-editor';

// ---------------------------------------------------------------------------
// Create Template Dialog
// ---------------------------------------------------------------------------

type CreateTemplateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateTemplateDialog({
  open,
  onOpenChange,
}: CreateTemplateDialogProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [recordType, setRecordType] = useState('');
  const [allowComment, setAllowComment] = useState(true);
  const [allowReturn, setAllowReturn] = useState(true);
  const [allowOverride, setAllowOverride] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([createEmptyStep()]);

  const utils = trpc.useUtils();
  const createMutation = trpc.workflow.templates.create.useMutation({
    onSuccess: () => {
      toast.success(`Template "${name}" created.`);
      utils.workflow.templates.list.invalidate();
      resetForm();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function resetForm() {
    setCode('');
    setName('');
    setRecordType('');
    setAllowComment(true);
    setAllowReturn(true);
    setAllowOverride(true);
    setSteps([createEmptyStep()]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!code.trim() || !name.trim() || !recordType.trim()) {
      toast.error('Code, name, and record type are required.');
      return;
    }

    // Validate steps
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s.name.trim()) {
        toast.error(`Step ${i + 1}: name is required.`);
        return;
      }
      if (!s.approverRuleValue.trim()) {
        toast.error(
          `Step ${i + 1}: approver rule value is required.`,
        );
        return;
      }
    }

    const payload = stepsToPayload(steps);

    createMutation.mutate({
      code,
      name,
      recordType,
      config: { allowComment, allowReturn, allowOverride },
      steps: payload as any,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Workflow Template</DialogTitle>
          <DialogDescription>
            Define an approval workflow with ordered steps. This is a form-based
            editor -- not a visual designer.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Basic fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tmpl-code">Code (unique identifier)</Label>
              <Input
                id="tmpl-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. document_approval_v1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tmpl-name">Name</Label>
              <Input
                id="tmpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Document Approval"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tmpl-record-type">Record Type</Label>
            <Input
              id="tmpl-record-type"
              value={recordType}
              onChange={(e) => setRecordType(e.target.value)}
              placeholder="e.g. document, ipa, rfq"
            />
            <p className="text-xs text-muted-foreground">
              Opaque string identifying which business record type this workflow
              applies to. Modules 2/3 will register ipa, rfq, etc.
            </p>
          </div>

          {/* Config toggles */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Configuration</Label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowComment}
                  onChange={(e) => setAllowComment(e.target.checked)}
                  className="rounded border-input"
                />
                Allow Comment
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowReturn}
                  onChange={(e) => setAllowReturn(e.target.checked)}
                  className="rounded border-input"
                />
                Allow Return
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowOverride}
                  onChange={(e) => setAllowOverride(e.target.checked)}
                  className="rounded border-input"
                />
                Allow Override
              </label>
            </div>
          </div>

          {/* Steps editor */}
          <WorkflowStepEditor steps={steps} onChange={setSteps} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? 'Creating...'
                : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
