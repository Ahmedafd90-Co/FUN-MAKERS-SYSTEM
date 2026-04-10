'use client';

/**
 * Workflow step editor — ordered list of steps with add/remove/reorder.
 *
 * Each step has: name, approver rule type, approver rule value, SLA hours,
 * optional flag. Steps can be reordered with move up/move down buttons.
 *
 * Task 1.5.10
 */

import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StepDraft = {
  key: string; // client-side key for React rendering
  name: string;
  approverRuleType: 'role' | 'user' | 'project_role';
  approverRuleValue: string;
  slaHours: string; // kept as string for input binding
  isOptional: boolean;
};

function generateKey(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyStep(): StepDraft {
  return {
    key: generateKey(),
    name: '',
    approverRuleType: 'role',
    approverRuleValue: '',
    slaHours: '',
    isOptional: false,
  };
}

/**
 * Convert step drafts to the shape expected by the workflow engine.
 */
export function stepsToPayload(steps: StepDraft[]) {
  return steps.map((s, idx) => {
    const base = {
      orderIndex: (idx + 1) * 10,
      name: s.name,
      slaHours: s.slaHours ? parseInt(s.slaHours, 10) : null,
      isOptional: s.isOptional,
      requirementFlags: {},
    };

    let approverRule: Record<string, unknown>;
    switch (s.approverRuleType) {
      case 'role':
        approverRule = { type: 'role', roleCode: s.approverRuleValue };
        break;
      case 'user':
        approverRule = { type: 'user', userId: s.approverRuleValue };
        break;
      case 'project_role':
        approverRule = {
          type: 'project_role',
          roleCode: s.approverRuleValue,
          projectScoped: true,
        };
        break;
    }

    return { ...base, approverRule };
  });
}

/**
 * Convert stored steps back to draft form (for editing existing templates).
 */
export function stepsFromPayload(
  steps: Array<{
    name: string;
    approverRuleJson: unknown;
    slaHours: number | null;
    isOptional: boolean;
  }>,
): StepDraft[] {
  return steps.map((s) => {
    const rule = s.approverRuleJson as Record<string, unknown>;
    let approverRuleType: StepDraft['approverRuleType'] = 'role';
    let approverRuleValue = '';

    if (rule.type === 'role') {
      approverRuleType = 'role';
      approverRuleValue = (rule.roleCode as string) ?? '';
    } else if (rule.type === 'user') {
      approverRuleType = 'user';
      approverRuleValue = (rule.userId as string) ?? '';
    } else if (rule.type === 'project_role') {
      approverRuleType = 'project_role';
      approverRuleValue = (rule.roleCode as string) ?? '';
    }

    return {
      key: generateKey(),
      name: s.name,
      approverRuleType,
      approverRuleValue,
      slaHours: s.slaHours != null ? String(s.slaHours) : '',
      isOptional: s.isOptional,
    };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type WorkflowStepEditorProps = {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
};

export function WorkflowStepEditor({ steps, onChange }: WorkflowStepEditorProps) {
  function updateStep(index: number, partial: Partial<StepDraft>) {
    const updated = [...steps];
    updated[index] = { ...updated[index], ...partial };
    onChange(updated);
  }

  function addStep() {
    onChange([...steps, createEmptyStep()]);
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return; // must have at least 1 step
    onChange(steps.filter((_, i) => i !== index));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const updated = [...steps];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated);
  }

  function moveDown(index: number) {
    if (index >= steps.length - 1) return;
    const updated = [...steps];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(updated);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          Approval Steps ({steps.length})
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={addStep}>
          <Plus className="h-3 w-3 mr-1" />
          Add Step
        </Button>
      </div>

      {steps.map((step, idx) => (
        <div
          key={step.key}
          className="rounded-md border border-border p-4 space-y-3 bg-muted/20"
        >
          {/* Step header with reorder + remove */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Step {idx + 1}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                title="Move up"
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => moveDown(idx)}
                disabled={idx >= steps.length - 1}
                title="Move down"
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => removeStep(idx)}
                disabled={steps.length <= 1}
                title="Remove step"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <Label className="text-xs">Step Name</Label>
            <Input
              value={step.name}
              onChange={(e) => updateStep(idx, { name: e.target.value })}
              placeholder="e.g. Document Controller Review"
            />
          </div>

          {/* Approver rule */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Approver Type</Label>
              <Select
                value={step.approverRuleType}
                onValueChange={(v) =>
                  updateStep(idx, {
                    approverRuleType: v as StepDraft['approverRuleType'],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">Role</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="project_role">Project Role</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                {step.approverRuleType === 'user'
                  ? 'User ID'
                  : 'Role Code'}
              </Label>
              <Input
                value={step.approverRuleValue}
                onChange={(e) =>
                  updateStep(idx, { approverRuleValue: e.target.value })
                }
                placeholder={
                  step.approverRuleType === 'user'
                    ? 'UUID of the user'
                    : 'e.g. document_controller'
                }
              />
            </div>
          </div>

          {/* SLA + Optional */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">SLA Hours (optional)</Label>
              <Input
                type="number"
                min="1"
                value={step.slaHours}
                onChange={(e) =>
                  updateStep(idx, { slaHours: e.target.value })
                }
                placeholder="e.g. 24"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={step.isOptional}
                  onChange={(e) =>
                    updateStep(idx, { isOptional: e.target.checked })
                  }
                  className="rounded border-input"
                />
                Optional step
              </label>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
