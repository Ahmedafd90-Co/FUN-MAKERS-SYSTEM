'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Plus, FileText, ShieldOff } from 'lucide-react';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Textarea } from '@fmksa/ui/components/textarea';
import { Label } from '@fmksa/ui/components/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@fmksa/ui/components/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@fmksa/ui/components/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { trpc } from '@/lib/trpc-client';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { CommercialStatusBadge } from '@/components/commercial/status-badge';
import { formatMoney } from '@/components/commercial/shared';
import { WorkflowRegisterCell } from '@/components/workflow/workflow-register-cell';

export default function EngineerInstructionsListPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [sheetOpen, setSheetOpen] = useState(false);

  // ── Form state ──
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [reserveRate, setReserveRate] = useState('0.5');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: me } = trpc.auth.me.useQuery();
  const canCreate = me?.permissions?.includes('variation.create');

  const { data, isLoading, error } =
    trpc.commercial.engineerInstruction.list.useQuery({
      projectId,
    });

  const recordIds = ((data ?? []) as Array<{ id: string }>).map((ei) => ei.id);
  const { data: workflowMap, isLoading: workflowLoading } =
    trpc.workflow.instances.listByRecords.useQuery(
      { recordType: 'engineer_instruction', recordIds },
      { enabled: recordIds.length > 0 },
    );

  const createMut = trpc.commercial.engineerInstruction.create.useMutation({
    onSuccess: (result) => {
      setSheetOpen(false);
      resetForm();
      if (result?.id) {
        router.push(
          `/projects/${projectId}/commercial/engineer-instructions/${result.id}`,
        );
      }
    },
    onError: (err) => setFormError(err.message),
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setEstimatedValue('');
    setCurrency('SAR');
    setReserveRate('0.5');
    setNotes('');
    setFormError(null);
  };

  const canSubmit = title.trim() !== '' && estimatedValue.trim() !== '';

  const handleCreate = () => {
    if (!canSubmit) return;
    setFormError(null);

    const input: Record<string, unknown> = {
      projectId,
      title: title.trim(),
      estimatedValue: parseFloat(estimatedValue),
      currency,
      reserveRate: parseFloat(reserveRate),
    };
    if (description.trim()) input.description = description.trim();
    if (notes.trim()) input.notes = notes.trim();

    createMut.mutate(input as any);
  };

  const computedReserve = (val: unknown, rate: unknown): string => {
    const v =
      typeof val === 'string'
        ? parseFloat(val)
        : typeof val === 'number'
          ? val
          : 0;
    const r =
      typeof rate === 'string'
        ? parseFloat(rate)
        : typeof rate === 'number'
          ? rate
          : 0.5;
    if (!v || isNaN(v)) return '0.00';
    return formatMoney(v * r);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Engineer Instructions"
        description="Manage field instructions and provisional reserves"
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create EI
            </Button>
          ) : undefined
        }
      />

      {error?.data?.code === 'FORBIDDEN' ? (
        <div className="py-16 text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium">Access Denied</p>
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to view Engineer Instructions in this
            project.
          </p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error.message}
        </div>
      ) : isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={FileText}
          title="No engineer instructions recorded yet."
          description="Create an engineer instruction to track field directives and provisional reserves."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Estimated Value</TableHead>
                <TableHead className="text-right">Reserve Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Workflow</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((ei: any) => (
                <TableRow
                  key={ei.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    router.push(
                      `/projects/${projectId}/commercial/engineer-instructions/${ei.id}`,
                    )
                  }
                >
                  <TableCell className="max-w-[250px] truncate">
                    <Link
                      href={`/projects/${projectId}/commercial/engineer-instructions/${ei.id}`}
                      className="font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {ei.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {ei.estimatedValue != null
                      ? formatMoney(ei.estimatedValue)
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {ei.estimatedValue != null
                      ? computedReserve(
                          ei.estimatedValue,
                          ei.reserveRate ?? 0.5,
                        )
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <CommercialStatusBadge status={ei.status} />
                  </TableCell>
                  <TableCell>
                    <WorkflowRegisterCell
                      instance={workflowMap?.[ei.id]}
                      recordStatus={ei.status}
                      isLoading={workflowLoading}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(ei.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Create EI Sheet ── */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) resetForm();
        }}
      >
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Create Engineer Instruction</SheetTitle>
            <SheetDescription>
              Record a new field instruction with an estimated value and
              provisional reserve.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ei-title">Title *</Label>
              <Input
                id="ei-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief instruction title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ei-description">Description</Label>
              <Textarea
                id="ei-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the instruction..."
                className="min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ei-estimated-value">Estimated Value *</Label>
                <Input
                  id="ei-estimated-value"
                  type="number"
                  step="0.01"
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SAR">SAR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ei-reserve-rate">
                Reserve Rate (default 0.5 = 50%)
              </Label>
              <Input
                id="ei-reserve-rate"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={reserveRate}
                onChange={(e) => setReserveRate(e.target.value)}
                placeholder="0.5"
              />
              {estimatedValue && reserveRate && (
                <p className="text-xs text-muted-foreground">
                  Reserve amount:{' '}
                  <span className="font-mono tabular-nums">
                    {computedReserve(estimatedValue, reserveRate)} {currency}
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ei-notes">Notes</Label>
              <Textarea
                id="ei-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                className="min-h-[60px]"
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>

          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSheetOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!canSubmit || createMut.isPending}
            >
              {createMut.isPending ? 'Creating...' : 'Create EI'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
