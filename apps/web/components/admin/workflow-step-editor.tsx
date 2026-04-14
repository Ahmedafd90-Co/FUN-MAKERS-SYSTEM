'use client';

/**
 * Workflow step editor — ordered list of steps with add/remove/reorder.
 *
 * Each step has: name, approver rule type, approver rule value, SLA hours,
 * optional flag. Steps can be reordered with move up/move down buttons.
 *
 * Approver assignment uses real dropdowns:
 *   - type 'user'         → searchable user combobox (name + email)
 *   - type 'role'         → role dropdown (name + code)
 *   - type 'project_role' → same role dropdown
 *
 * Task 1.5.10
 */

import { useEffect, useState } from 'react';
import { Button } from '@fmksa/ui/components/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@fmksa/ui/components/command';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@fmksa/ui/components/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { ArrowUp, ArrowDown, ChevronsUpDown, Plus, Trash2, X } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutcomeType = 'review' | 'approve' | 'sign' | 'issue' | 'acknowledge';

export type StepDraft = {
  key: string; // client-side key for React rendering
  name: string;
  approverRuleType: 'role' | 'user' | 'project_role';
  approverRuleValue: string;
  /** Display label for the selected approver (user name or role name). UI-only. */
  approverDisplayLabel?: string | undefined;
  slaHours: string; // kept as string for input binding
  isOptional: boolean;
  outcomeType: OutcomeType;
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
    outcomeType: 'approve',
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

    return { ...base, approverRule, outcomeType: s.outcomeType };
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
    outcomeType?: string;
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

    const validOutcomes: OutcomeType[] = ['review', 'approve', 'sign', 'issue', 'acknowledge'];
    const rawOutcome = s.outcomeType ?? 'approve';
    const outcomeType: OutcomeType = validOutcomes.includes(rawOutcome as OutcomeType)
      ? (rawOutcome as OutcomeType)
      : 'approve';

    return {
      key: generateKey(),
      name: s.name,
      approverRuleType,
      approverRuleValue,
      slaHours: s.slaHours != null ? String(s.slaHours) : '',
      isOptional: s.isOptional,
      outcomeType,
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
  function updateStep(index: number, patch: Partial<StepDraft>) {
    const updated = [...steps];
    const existing = updated[index];
    if (!existing) return;
    updated[index] = { ...existing, ...patch } as StepDraft;
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
    const a = updated[index - 1]!;
    const b = updated[index]!;
    updated[index - 1] = b;
    updated[index] = a;
    onChange(updated);
  }

  function moveDown(index: number) {
    if (index >= steps.length - 1) return;
    const updated = [...steps];
    const a = updated[index]!;
    const b = updated[index + 1]!;
    updated[index] = b;
    updated[index + 1] = a;
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
                    approverRuleValue: '',
                    approverDisplayLabel: undefined,
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
                {step.approverRuleType === 'user' ? 'User' : 'Role'}
              </Label>
              {step.approverRuleType === 'user' ? (
                <UserPicker
                  value={step.approverRuleValue}
                  displayLabel={step.approverDisplayLabel}
                  onSelect={(userId, displayLabel) =>
                    updateStep(idx, {
                      approverRuleValue: userId,
                      approverDisplayLabel: displayLabel,
                    })
                  }
                  onClear={() =>
                    updateStep(idx, {
                      approverRuleValue: '',
                      approverDisplayLabel: undefined,
                    })
                  }
                />
              ) : (
                <RolePicker
                  value={step.approverRuleValue}
                  onSelect={(roleCode, displayLabel) =>
                    updateStep(idx, {
                      approverRuleValue: roleCode,
                      approverDisplayLabel: displayLabel,
                    })
                  }
                />
              )}
            </div>
          </div>

          {/* Outcome Type + SLA */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Outcome Type</Label>
              <Select
                value={step.outcomeType}
                onValueChange={(v) =>
                  updateStep(idx, { outcomeType: v as OutcomeType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="approve">Approve</SelectItem>
                  <SelectItem value="sign">Sign</SelectItem>
                  <SelectItem value="issue">Issue</SelectItem>
                  <SelectItem value="acknowledge">Acknowledge</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

// ---------------------------------------------------------------------------
// UserPicker — searchable combobox for user assignment
// ---------------------------------------------------------------------------

type UserPickerProps = {
  value: string;
  displayLabel?: string | undefined;
  onSelect: (userId: string, displayLabel: string) => void;
  onClear: () => void;
};

function UserPicker({ value, displayLabel, onSelect, onClear }: UserPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: results, isFetching } = trpc.projects.userSearch.useQuery(
    { query: debouncedSearch },
    { enabled: debouncedSearch.length >= 2 },
  );

  // Show selected user chip when a value is set
  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-input px-3 py-1.5 h-9">
        <span className="flex-1 min-w-0 text-sm truncate">
          {displayLabel || value}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={onClear}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal text-muted-foreground h-9 text-xs"
        >
          Search users...
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type name or email..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {debouncedSearch.length < 2 ? (
              <CommandEmpty>Type at least 2 characters.</CommandEmpty>
            ) : isFetching ? (
              <CommandEmpty>Searching...</CommandEmpty>
            ) : !results || results.length === 0 ? (
              <CommandEmpty>No users found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {results.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={user.id}
                    onSelect={() => {
                      onSelect(user.id, `${user.name} (${user.email})`);
                      setSearch('');
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="truncate text-sm">{user.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// RolePicker — dropdown for role / project_role assignment
// ---------------------------------------------------------------------------

type RolePickerProps = {
  value: string;
  onSelect: (roleCode: string, displayLabel: string) => void;
};

function RolePicker({ value, onSelect }: RolePickerProps) {
  const { data: roles } = trpc.adminUsers.roleList.useQuery();

  return (
    <Select
      value={value}
      onValueChange={(code) => {
        const match = roles?.find((r) => r.code === code);
        onSelect(code, match ? `${match.name} (${match.code})` : code);
      }}
    >
      <SelectTrigger className="h-9 text-xs">
        <SelectValue placeholder="Select a role..." />
      </SelectTrigger>
      <SelectContent>
        {roles?.map((role) => (
          <SelectItem key={role.code} value={role.code}>
            {role.name}{' '}
            <span className="text-muted-foreground font-mono text-[10px]">
              {role.code}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
