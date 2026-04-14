'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Textarea } from '@fmksa/ui/components/textarea';
import { Label } from '@fmksa/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Subtype configuration
// ---------------------------------------------------------------------------

const SUBTYPES = [
  {
    value: 'vo' as const,
    label: 'Variation Order',
    description: 'A change to the scope of works initiated by either party',
  },
  {
    value: 'change_order' as const,
    label: 'Change Order',
    description: 'A formal amendment to the contract value and/or time',
  },
];

type Subtype = 'vo' | 'change_order';

// ---------------------------------------------------------------------------
// Create Variation Page
// ---------------------------------------------------------------------------

export default function CreateVariationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  // Form state — matches CreateVariationInputSchema
  const [subtype, setSubtype] = useState<Subtype | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [costImpact, setCostImpact] = useState('');
  const [timeImpactDays, setTimeImpactDays] = useState('');
  const [currency, setCurrency] = useState('SAR');

  // VO-specific
  const [initiatedBy, setInitiatedBy] = useState<string>('');
  const [contractClause, setContractClause] = useState('');

  // CO-specific
  const [originalContractValue, setOriginalContractValue] = useState('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [newContractValue, setNewContractValue] = useState('');
  const [timeAdjustmentDays, setTimeAdjustmentDays] = useState('');

  const [error, setError] = useState<string | null>(null);

  const createMut = trpc.commercial.variation.create.useMutation({
    onSuccess: (data) => {
      if (data) {
        router.push(
          `/projects/${projectId}/commercial/variations/${data.id}`,
        );
      }
    },
    onError: (err) => setError(err.message),
  });

  const canSubmit =
    subtype !== '' && title.trim() !== '' && description.trim() !== '' && reason.trim() !== '';

  const handleCreate = () => {
    if (!canSubmit) return;
    setError(null);

    const input: Record<string, unknown> = {
      projectId,
      subtype,
      title: title.trim(),
      description: description.trim(),
      reason: reason.trim(),
      currency,
    };

    if (costImpact) input.costImpact = parseFloat(costImpact);
    if (timeImpactDays) input.timeImpactDays = parseInt(timeImpactDays, 10);

    // VO-specific fields
    if (subtype === 'vo') {
      if (initiatedBy) input.initiatedBy = initiatedBy;
      if (contractClause.trim()) input.contractClause = contractClause.trim();
    }

    // CO-specific fields
    if (subtype === 'change_order') {
      if (originalContractValue)
        input.originalContractValue = parseFloat(originalContractValue);
      if (adjustmentAmount)
        input.adjustmentAmount = parseFloat(adjustmentAmount);
      if (newContractValue)
        input.newContractValue = parseFloat(newContractValue);
      if (timeAdjustmentDays)
        input.timeAdjustmentDays = parseInt(timeAdjustmentDays, 10);
    }

    createMut.mutate(input as any);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href={`/projects/${projectId}/commercial/variations`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Variations
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Create Variation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a type, fill in the details, and save as draft.
        </p>
      </div>

      {/* Subtype selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Type *</CardTitle>
          <CardDescription>
            Choose the variation type. This determines the workflow and available
            fields.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {SUBTYPES.map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => setSubtype(st.value)}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  subtype === st.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="text-sm font-medium">{st.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {st.description}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Common fields — shown once subtype is selected */}
      {subtype && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Brief variation title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the variation..."
                  className="min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason *</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for this variation..."
                  className="min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="costImpact">Cost Impact</Label>
                  <Input
                    id="costImpact"
                    type="number"
                    step="0.01"
                    value={costImpact}
                    onChange={(e) => setCostImpact(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeImpactDays">Time Impact (days)</Label>
                  <Input
                    id="timeImpactDays"
                    type="number"
                    step="1"
                    value={timeImpactDays}
                    onChange={(e) => setTimeImpactDays(e.target.value)}
                    placeholder="0"
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
            </CardContent>
          </Card>

          {/* VO-specific fields */}
          {subtype === 'vo' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Variation Order Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Initiated By</Label>
                    <Select
                      value={initiatedBy}
                      onValueChange={setInitiatedBy}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="client">Client</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voContractClause">Contract Clause</Label>
                    <Input
                      id="voContractClause"
                      value={contractClause}
                      onChange={(e) => setContractClause(e.target.value)}
                      placeholder="e.g. Clause 13.1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* CO-specific fields */}
          {subtype === 'change_order' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Change Order Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="originalContractValue">
                      Original Contract Value
                    </Label>
                    <Input
                      id="originalContractValue"
                      type="number"
                      step="0.01"
                      value={originalContractValue}
                      onChange={(e) =>
                        setOriginalContractValue(e.target.value)
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adjustmentAmount">Adjustment Amount</Label>
                    <Input
                      id="adjustmentAmount"
                      type="number"
                      step="0.01"
                      value={adjustmentAmount}
                      onChange={(e) => setAdjustmentAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newContractValue">
                      New Contract Value
                    </Label>
                    <Input
                      id="newContractValue"
                      type="number"
                      step="0.01"
                      value={newContractValue}
                      onChange={(e) => setNewContractValue(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeAdjustmentDays">
                      Time Adjustment (days)
                    </Label>
                    <Input
                      id="timeAdjustmentDays"
                      type="number"
                      step="1"
                      value={timeAdjustmentDays}
                      onChange={(e) => setTimeAdjustmentDays(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button
              onClick={handleCreate}
              disabled={!canSubmit || createMut.isPending}
            >
              {createMut.isPending ? 'Creating...' : 'Create Draft'}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                router.push(`/projects/${projectId}/commercial/variations`)
              }
            >
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
