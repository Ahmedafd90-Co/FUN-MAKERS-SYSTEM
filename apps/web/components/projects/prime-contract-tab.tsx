'use client';

import { useEffect, useState } from 'react';
import { Pencil, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@fmksa/ui/components/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { Separator } from '@fmksa/ui/components/separator';
import { Textarea } from '@fmksa/ui/components/textarea';

import { trpc } from '@/lib/trpc-client';
import { PermissionDenied } from '@/components/ui/permission-denied';

import {
  ACTION_PAST_TENSE,
  COMMENT_REQUIRED_ACTIONS,
  CONFIRM_ACTIONS,
  PRIME_CONTRACT_STATUS_ACTIONS,
  STATUS_LABELS,
  checkDateOrdering,
  statusVariant,
  type PrimeContractAction as Action,
  type PrimeContractActionDef as ActionDef,
  type PrimeContractStatus as Status,
} from './prime-contract-helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(val: unknown, currency?: string): string {
  const num =
    typeof val === 'string' ? parseFloat(val) : typeof val === 'number' ? val : 0;
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function isoToDateInput(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? iso : iso.toISOString();
  return d.slice(0, 10);
}

function dateInputToISO(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

// ---------------------------------------------------------------------------
// Field display helper
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="text-sm mt-0.5">{value ?? '—'}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form state shape (shared by create + edit)
// ---------------------------------------------------------------------------

type FormState = {
  contractingEntityId: string;
  clientName: string;
  clientReference: string;
  contractValue: string; // string in form, parsed on submit
  contractCurrency: string;
  signedDate: string;
  effectiveDate: string;
  expectedCompletionDate: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  contractingEntityId: '',
  clientName: '',
  clientReference: '',
  contractValue: '',
  contractCurrency: 'SAR',
  signedDate: '',
  effectiveDate: '',
  expectedCompletionDate: '',
  notes: '',
};

// ---------------------------------------------------------------------------
// TransitionActionsBar
// ---------------------------------------------------------------------------

function TransitionActionsBar({
  projectId,
  status,
  userPermissions,
}: {
  projectId: string;
  status: Status;
  userPermissions: string[];
}) {
  const utils = trpc.useUtils();
  const [confirmAction, setConfirmAction] = useState<ActionDef | null>(null);
  const [comment, setComment] = useState('');

  const transitionMut = trpc.layer1.primeContract.transition.useMutation({
    onSuccess: (_, variables) => {
      utils.layer1.primeContract.get.invalidate({ projectId });
      toast.success(`Contract ${ACTION_PAST_TENSE[variables.action as Action]}.`);
      setConfirmAction(null);
      setComment('');
    },
    onError: (err) => {
      toast.error(err.message ?? 'Transition failed.');
    },
  });

  const isAdmin = userPermissions.includes('system.admin');
  const allActions = PRIME_CONTRACT_STATUS_ACTIONS[status] ?? [];
  const actions = allActions.filter(
    (a) => isAdmin || userPermissions.includes(`prime_contract.${a.action}`),
  );

  if (actions.length === 0) {
    if (allActions.length === 0) {
      return (
        <p className="text-xs text-muted-foreground">
          Contract is in {STATUS_LABELS[status]?.toLowerCase() ?? status} state. No
          further actions available.
        </p>
      );
    }
    return null;
  }

  const runAction = (action: Action, transitionComment?: string) => {
    transitionMut.mutate({
      projectId,
      action,
      ...(transitionComment ? { comment: transitionComment } : {}),
    });
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant={a.variant}
            disabled={transitionMut.isPending}
            onClick={() => {
              if (CONFIRM_ACTIONS.includes(a.action)) {
                setConfirmAction(a);
                setComment('');
              } else {
                runAction(a.action);
              }
            }}
          >
            {transitionMut.isPending && transitionMut.variables?.action === a.action
              ? 'Processing...'
              : a.label}
          </Button>
        ))}
      </div>

      <Dialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
            setComment('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm: {confirmAction?.label}</DialogTitle>
            <DialogDescription>
              {confirmAction?.action === 'terminate'
                ? 'Terminating this contract is a permanent action. The contract will move to the terminated state.'
                : 'Cancelling this contract is a permanent action. The contract will move to the cancelled state.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prime-contract-comment">
                Comment (optional)
              </Label>
              <Textarea
                id="prime-contract-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Provide a brief reason for this action."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmAction(null);
                  setComment('');
                }}
                disabled={transitionMut.isPending}
              >
                Cancel
              </Button>
              <Button
                variant={confirmAction?.variant === 'destructive' ? 'destructive' : 'default'}
                disabled={
                  transitionMut.isPending ||
                  (COMMENT_REQUIRED_ACTIONS.includes(confirmAction?.action as Action) &&
                    !comment.trim())
                }
                onClick={() => {
                  if (confirmAction) runAction(confirmAction.action, comment.trim() || undefined);
                }}
              >
                {transitionMut.isPending
                  ? 'Processing...'
                  : `Confirm ${confirmAction?.label ?? ''}`}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Form (used by both Create and Edit modes)
// ---------------------------------------------------------------------------

type ContractFormProps = {
  form: FormState;
  setForm: (next: FormState) => void;
  /** When true, the contractingEntity field renders as a display-only block. */
  entityImmutable?: boolean;
  /** Used when entityImmutable is true to render the entity name + code. */
  entityDisplay?: { name: string; code: string };
  /** Entity options for the Select (only used when entityImmutable is false). */
  entityOptions?: Array<{ id: string; name: string; code: string }>;
  entitiesLoading?: boolean;
  /** Currency options. */
  currencyOptions?: Array<{ code: string; name?: string | undefined }>;
};

function ContractForm({
  form,
  setForm,
  entityImmutable,
  entityDisplay,
  entityOptions,
  entitiesLoading,
  currencyOptions,
}: ContractFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="contractingEntityId">Contracting Entity *</Label>
        {entityImmutable ? (
          <>
            <p className="text-sm font-medium">
              {entityDisplay?.name ?? '(unknown entity)'}
              {entityDisplay?.code && (
                <span className="ml-2 text-xs text-muted-foreground font-mono">
                  ({entityDisplay.code})
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Contracting entity is immutable. To change it, delete this contract and
              create a new one.
            </p>
          </>
        ) : (
          <Select
            value={form.contractingEntityId}
            onValueChange={(v) => setForm({ ...form, contractingEntityId: v })}
            disabled={!!entitiesLoading}
          >
            <SelectTrigger id="contractingEntityId">
              <SelectValue
                placeholder={entitiesLoading ? 'Loading entities...' : 'Select an entity'}
              />
            </SelectTrigger>
            <SelectContent>
              {(entityOptions ?? []).map((entity) => (
                <SelectItem key={entity.id} value={entity.id}>
                  {entity.name} ({entity.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="clientName">Client Name *</Label>
        <Input
          id="clientName"
          value={form.clientName}
          onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          placeholder="e.g., Royal Commission for AlUla"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="clientReference">Client Reference</Label>
        <Input
          id="clientReference"
          value={form.clientReference}
          onChange={(e) => setForm({ ...form, clientReference: e.target.value })}
          placeholder="Optional"
        />
        <p className="text-xs text-muted-foreground">
          Optional. The client&apos;s own reference number for this contract (e.g., their PO number).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contractValue">Contract Value *</Label>
          <Input
            id="contractValue"
            type="number"
            min={0.01}
            step="0.01"
            value={form.contractValue}
            onChange={(e) => setForm({ ...form, contractValue: e.target.value })}
            placeholder="0.00"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contractCurrency">Contract Currency *</Label>
          <Select
            value={form.contractCurrency}
            onValueChange={(v) => setForm({ ...form, contractCurrency: v })}
          >
            <SelectTrigger id="contractCurrency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(currencyOptions ?? [{ code: 'SAR' }]).map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name ? `${c.name} (${c.code})` : c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="signedDate">Signed Date</Label>
          <Input
            id="signedDate"
            type="date"
            value={form.signedDate}
            onChange={(e) => setForm({ ...form, signedDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="effectiveDate">Effective Date</Label>
          <Input
            id="effectiveDate"
            type="date"
            value={form.effectiveDate}
            onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expectedCompletionDate">Expected Completion</Label>
          <Input
            id="expectedCompletionDate"
            type="date"
            value={form.expectedCompletionDate}
            onChange={(e) =>
              setForm({ ...form, expectedCompletionDate: e.target.value })
            }
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Optional notes about this contract"
          rows={3}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create panel
// ---------------------------------------------------------------------------

function PrimeContractCreatePanel({
  projectId,
  canCreate,
}: {
  projectId: string;
  canCreate: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: entities, isLoading: entitiesLoading } = trpc.entities.list.useQuery(
    { includeArchived: false },
    { enabled: canCreate },
  );
  const { data: currencies } = trpc.referenceData.currencies.list.useQuery(undefined, {
    enabled: canCreate,
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const createMut = trpc.layer1.primeContract.create.useMutation({
    onSuccess: () => {
      utils.layer1.primeContract.get.invalidate({ projectId });
    },
    onError: (err) => setError(err.message),
  });

  if (!canCreate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">No Prime Contract Yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Every project has a single prime contract that defines the agreement with
            the client. Once created, it tracks dates, values, and status transitions.
          </p>
          <p>You don&apos;t have permission to create a contract for this project.</p>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.clientName.trim()) {
      setError('Client name is required.');
      return;
    }
    if (!form.contractingEntityId) {
      setError('Contracting entity is required.');
      return;
    }
    const value = Number(form.contractValue);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Contract value must be a positive number.');
      return;
    }
    if (form.contractCurrency.length !== 3) {
      setError('Contract currency is required.');
      return;
    }
    const orderingError = checkDateOrdering(
      form.signedDate,
      form.effectiveDate,
      form.expectedCompletionDate,
    );
    if (orderingError) {
      setError(orderingError);
      return;
    }
    if (!me?.id) {
      setError('Unable to identify current user. Please refresh.');
      return;
    }

    createMut.mutate({
      projectId,
      contractingEntityId: form.contractingEntityId,
      clientName: form.clientName.trim(),
      clientReference: form.clientReference.trim() || null,
      contractValue: value,
      contractCurrency: form.contractCurrency,
      signedDate: form.signedDate ? dateInputToISO(form.signedDate) : null,
      effectiveDate: form.effectiveDate ? dateInputToISO(form.effectiveDate) : null,
      expectedCompletionDate: form.expectedCompletionDate
        ? dateInputToISO(form.expectedCompletionDate)
        : null,
      notes: form.notes.trim() || null,
      createdBy: me.id,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Create Prime Contract</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Every project has a single prime contract that defines the agreement with
          the client. Create it to begin tracking dates, values, and status transitions.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <ContractForm
            form={form}
            setForm={setForm}
            entityOptions={(entities ?? []).map((e) => ({
              id: e.id,
              name: e.name,
              code: e.code,
            }))}
            entitiesLoading={entitiesLoading}
            currencyOptions={(currencies ?? []).map((c: { code: string; name?: string }) => ({
              code: c.code,
              name: c.name,
            }))}
          />
          <Button type="submit" disabled={createMut.isPending || !me?.id}>
            {createMut.isPending ? 'Creating...' : 'Create Contract'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Display (read-only + edit toggle)
// ---------------------------------------------------------------------------

type ContractData = {
  id: string;
  status: string;
  contractingEntityId: string;
  clientName: string;
  clientReference: string | null;
  contractValue: unknown;
  contractCurrency: string;
  signedDate: string | Date | null;
  effectiveDate: string | Date | null;
  expectedCompletionDate: string | Date | null;
  notes: string | null;
  contractingEntity?: { id: string; name: string; code: string } | null;
};

function PrimeContractDisplay({
  projectId,
  contract,
  canEdit,
  userPermissions,
}: {
  projectId: string;
  contract: ContractData;
  canEdit: boolean;
  userPermissions: string[];
}) {
  const utils = trpc.useUtils();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const { data: currencies } = trpc.referenceData.currencies.list.useQuery(undefined, {
    enabled: isEditing,
  });

  useEffect(() => {
    if (contract && isEditing) {
      setForm({
        contractingEntityId: contract.contractingEntityId,
        clientName: contract.clientName,
        clientReference: contract.clientReference ?? '',
        contractValue: String(contract.contractValue ?? ''),
        contractCurrency: contract.contractCurrency,
        signedDate: isoToDateInput(contract.signedDate),
        effectiveDate: isoToDateInput(contract.effectiveDate),
        expectedCompletionDate: isoToDateInput(contract.expectedCompletionDate),
        notes: contract.notes ?? '',
      });
      setError(null);
    }
  }, [contract, isEditing]);

  const updateMut = trpc.layer1.primeContract.update.useMutation({
    onSuccess: () => {
      utils.layer1.primeContract.get.invalidate({ projectId });
      setIsEditing(false);
    },
    onError: (err) => setError(err.message),
  });

  const entity = contract.contractingEntity;
  const status = contract.status as Status;

  if (isEditing) {
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!form.clientName.trim()) {
        setError('Client name is required.');
        return;
      }
      const value = Number(form.contractValue);
      if (!Number.isFinite(value) || value <= 0) {
        setError('Contract value must be a positive number.');
        return;
      }
      if (form.contractCurrency.length !== 3) {
        setError('Contract currency is required.');
        return;
      }
      const orderingError = checkDateOrdering(
        form.signedDate,
        form.effectiveDate,
        form.expectedCompletionDate,
      );
      if (orderingError) {
        setError(orderingError);
        return;
      }

      updateMut.mutate({
        projectId,
        clientName: form.clientName.trim(),
        clientReference: form.clientReference.trim() || null,
        contractValue: value,
        contractCurrency: form.contractCurrency,
        signedDate: form.signedDate ? dateInputToISO(form.signedDate) : null,
        effectiveDate: form.effectiveDate ? dateInputToISO(form.effectiveDate) : null,
        expectedCompletionDate: form.expectedCompletionDate
          ? dateInputToISO(form.expectedCompletionDate)
          : null,
        notes: form.notes.trim() || null,
      });
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Edit Prime Contract</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <ContractForm
              form={form}
              setForm={setForm}
              entityImmutable
              {...(entity ? { entityDisplay: { name: entity.name, code: entity.code } } : {})}
              currencyOptions={(currencies ?? []).map(
                (c: { code: string; name?: string }) => ({ code: c.code, name: c.name }),
              )}
            />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={updateMut.isPending}
                onClick={() => {
                  setIsEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-sm">Prime Contract</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant(status)} className="text-xs">
                {STATUS_LABELS[status] ?? status}
              </Badge>
            </div>
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Contracting Entity"
            value={
              entity ? (
                <>
                  {entity.name}{' '}
                  <span className="text-xs text-muted-foreground font-mono">
                    ({entity.code})
                  </span>
                </>
              ) : (
                '—'
              )
            }
          />
          <Field label="Client Name" value={contract.clientName} />
          <Field label="Client Reference" value={contract.clientReference || '—'} />
          <Field
            label="Contract Value"
            value={formatMoney(contract.contractValue, contract.contractCurrency)}
          />
          <Field label="Signed Date" value={formatDate(contract.signedDate)} />
          <Field label="Effective Date" value={formatDate(contract.effectiveDate)} />
          <Field
            label="Expected Completion"
            value={formatDate(contract.expectedCompletionDate)}
          />
        </div>

        {contract.notes && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Notes
              </p>
              <p className="text-sm whitespace-pre-wrap">{contract.notes}</p>
            </div>
          </>
        )}

        <Separator />
        <TransitionActionsBar
          projectId={projectId}
          status={status}
          userPermissions={userPermissions}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Entry — PrimeContractTab
// ---------------------------------------------------------------------------

type Props = {
  projectId: string;
};

export function PrimeContractTab({ projectId }: Props) {
  const { data: userPermissions } = trpc.layer1.primeContract.myPermissions.useQuery();
  const perms = userPermissions ?? [];
  const canView = perms.includes('prime_contract.view') || perms.includes('system.admin');
  const canCreate = perms.includes('prime_contract.create') || perms.includes('system.admin');
  const canEdit = perms.includes('prime_contract.edit') || perms.includes('system.admin');

  const { data, isLoading, error } = trpc.layer1.primeContract.get.useQuery(
    { projectId },
    { enabled: userPermissions !== undefined && canView },
  );

  if (userPermissions !== undefined && !canView) {
    return <PermissionDenied />;
  }

  if (error?.data?.code === 'FORBIDDEN') {
    return (
      <div className="py-16 text-center space-y-2">
        <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm font-medium">Access Denied</p>
        <p className="text-xs text-muted-foreground">
          You don&apos;t have permission to view this project&apos;s prime contract.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center text-sm text-destructive">{error.message}</div>
    );
  }

  if (isLoading || userPermissions === undefined) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
    );
  }

  if (!data) {
    return <PrimeContractCreatePanel projectId={projectId} canCreate={canCreate} />;
  }

  return (
    <PrimeContractDisplay
      projectId={projectId}
      contract={data as ContractData}
      canEdit={canEdit}
      userPermissions={perms}
    />
  );
}
