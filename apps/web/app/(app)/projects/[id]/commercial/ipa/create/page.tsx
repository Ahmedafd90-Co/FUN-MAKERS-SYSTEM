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
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { trpc } from '@/lib/trpc-client';
import type { CreateIpaInput } from '@fmksa/contracts';

// ---------------------------------------------------------------------------
// Create IPA Page
// ---------------------------------------------------------------------------

export default function CreateIpaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  // Form state — matches CreateIpaInputSchema
  const [periodNumber, setPeriodNumber] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [retentionRate, setRetentionRate] = useState('');
  const [retentionAmount, setRetentionAmount] = useState('');
  const [previousCertified, setPreviousCertified] = useState('');
  const [currentClaim, setCurrentClaim] = useState('');
  const [advanceRecovery, setAdvanceRecovery] = useState('');
  const [otherDeductions, setOtherDeductions] = useState('');
  const [netClaimed, setNetClaimed] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [description, setDescription] = useState('');

  const [error, setError] = useState<string | null>(null);

  const createMut = trpc.commercial.ipa.create.useMutation({
    onSuccess: (data) => {
      if (data) {
        router.push(`/projects/${projectId}/commercial/ipa/${data.id}`);
      }
    },
    onError: (err) => setError(err.message),
  });

  const canSubmit =
    periodNumber !== '' &&
    periodFrom !== '' &&
    periodTo !== '' &&
    grossAmount !== '' &&
    retentionRate !== '' &&
    retentionAmount !== '' &&
    previousCertified !== '' &&
    currentClaim !== '' &&
    netClaimed !== '';

  const handleCreate = () => {
    if (!canSubmit) return;
    setError(null);

    const input: CreateIpaInput = {
      projectId,
      periodNumber: parseInt(periodNumber, 10),
      periodFrom: new Date(periodFrom).toISOString(),
      periodTo: new Date(periodTo).toISOString(),
      grossAmount: parseFloat(grossAmount),
      retentionRate: parseFloat(retentionRate) / 100, // UI: %, schema: 0–1
      retentionAmount: parseFloat(retentionAmount),
      previousCertified: parseFloat(previousCertified),
      currentClaim: parseFloat(currentClaim),
      netClaimed: parseFloat(netClaimed),
      currency,
    };

    if (advanceRecovery) input.advanceRecovery = parseFloat(advanceRecovery);
    if (otherDeductions) input.otherDeductions = parseFloat(otherDeductions);
    if (description.trim()) input.description = description.trim();

    createMut.mutate(input);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href={`/projects/${projectId}/commercial/ipa`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to IPAs
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Create IPA</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new Interim Payment Application as draft.
        </p>
      </div>

      {/* Period information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Period</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="periodNumber">Period Number *</Label>
              <Input
                id="periodNumber"
                type="number"
                step="1"
                min="1"
                value={periodNumber}
                onChange={(e) => setPeriodNumber(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodFrom">Period From *</Label>
              <Input
                id="periodFrom"
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodTo">Period To *</Label>
              <Input
                id="periodTo"
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Financial Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="grossAmount">Gross Amount *</Label>
              <Input
                id="grossAmount"
                type="number"
                step="0.01"
                value={grossAmount}
                onChange={(e) => setGrossAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentClaim">Current Claim *</Label>
              <Input
                id="currentClaim"
                type="number"
                step="0.01"
                value={currentClaim}
                onChange={(e) => setCurrentClaim(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="retentionRate">Retention Rate (%) *</Label>
              <Input
                id="retentionRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={retentionRate}
                onChange={(e) => setRetentionRate(e.target.value)}
                placeholder="e.g. 10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retentionAmount">Retention Amount *</Label>
              <Input
                id="retentionAmount"
                type="number"
                step="0.01"
                value={retentionAmount}
                onChange={(e) => setRetentionAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="previousCertified">Previous Certified *</Label>
              <Input
                id="previousCertified"
                type="number"
                step="0.01"
                value={previousCertified}
                onChange={(e) => setPreviousCertified(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="netClaimed">Net Claimed *</Label>
              <Input
                id="netClaimed"
                type="number"
                step="0.01"
                value={netClaimed}
                onChange={(e) => setNetClaimed(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="advanceRecovery">Advance Recovery</Label>
              <Input
                id="advanceRecovery"
                type="number"
                step="0.01"
                value={advanceRecovery}
                onChange={(e) => setAdvanceRecovery(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="otherDeductions">Other Deductions</Label>
              <Input
                id="otherDeductions"
                type="number"
                step="0.01"
                value={otherDeductions}
                onChange={(e) => setOtherDeductions(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="space-y-2 max-w-[200px]">
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
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Additional Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this IPA..."
              className="min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

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
            router.push(`/projects/${projectId}/commercial/ipa`)
          }
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
