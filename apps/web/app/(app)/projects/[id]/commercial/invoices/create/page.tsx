'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { trpc } from '@/lib/trpc-client';
import type { CreateTaxInvoiceInput } from '@fmksa/contracts';

// ---------------------------------------------------------------------------
// Create Tax Invoice Page
// ---------------------------------------------------------------------------

export default function CreateTaxInvoicePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  // Form state — matches CreateTaxInvoiceInputSchema
  const [ipcId, setIpcId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [vatRate, setVatRate] = useState('15'); // default 15% for KSA
  const [vatAmount, setVatAmount] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [buyerName, setBuyerName] = useState('');
  const [buyerTaxId, setBuyerTaxId] = useState('');
  const [sellerTaxId, setSellerTaxId] = useState('');

  const [error, setError] = useState<string | null>(null);

  // Fetch IPCs for this project so user can select which IPC to invoice
  const { data: ipcs } = trpc.commercial.ipc.list.useQuery({
    projectId,
    take: 100,
    sortField: 'createdAt',
    sortDirection: 'desc',
  } as any);

  const createMut = trpc.commercial.taxInvoice.create.useMutation({
    onSuccess: (data) => {
      if (data) {
        router.push(
          `/projects/${projectId}/commercial/invoices/${data.id}`,
        );
      }
    },
    onError: (err) => setError(err.message),
  });

  // Auto-calculate VAT & total when gross or rate changes
  const handleGrossOrRateChange = (
    newGross: string,
    newRate: string,
  ) => {
    setGrossAmount(newGross);
    setVatRate(newRate);
    const g = parseFloat(newGross);
    const r = parseFloat(newRate);
    if (!isNaN(g) && !isNaN(r)) {
      const vat = g * (r / 100);
      setVatAmount(vat.toFixed(2));
      setTotalAmount((g + vat).toFixed(2));
    }
  };

  const canSubmit =
    ipcId !== '' &&
    invoiceNumber.trim() !== '' &&
    invoiceDate !== '' &&
    grossAmount !== '' &&
    vatRate !== '' &&
    vatAmount !== '' &&
    totalAmount !== '' &&
    buyerName.trim() !== '' &&
    sellerTaxId.trim() !== '';

  const handleCreate = () => {
    if (!canSubmit) return;
    setError(null);

    const input: CreateTaxInvoiceInput = {
      projectId,
      ipcId,
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate: new Date(invoiceDate).toISOString(),
      grossAmount: parseFloat(grossAmount),
      vatRate: parseFloat(vatRate) / 100, // UI: %, schema: 0–1
      vatAmount: parseFloat(vatAmount),
      totalAmount: parseFloat(totalAmount),
      currency,
      buyerName: buyerName.trim(),
      sellerTaxId: sellerTaxId.trim(),
    };

    if (dueDate) input.dueDate = new Date(dueDate).toISOString();
    if (buyerTaxId.trim()) input.buyerTaxId = buyerTaxId.trim();

    createMut.mutate(input);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href={`/projects/${projectId}/commercial/invoices`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Invoices
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Create Tax Invoice</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new tax invoice against a signed IPC.
        </p>
      </div>

      {/* IPC selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Source IPC *</CardTitle>
          <CardDescription>
            Select the IPC this invoice is issued against.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={ipcId} onValueChange={setIpcId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an IPC..." />
            </SelectTrigger>
            <SelectContent>
              {(ipcs?.items ?? []).map((ipc) => (
                <SelectItem key={ipc.id} value={ipc.id}>
                  {ipc.referenceNumber ?? `#${ipc.id.slice(0, 8)}`}{' — '}
                  <span className="text-muted-foreground">{ipc.status}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Invoice details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Invoice Number *</Label>
              <Input
                id="invoiceNumber"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Invoice Date *</Label>
              <Input
                id="invoiceDate"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
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

      {/* Amounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Amounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="grossAmount">Gross Amount *</Label>
              <Input
                id="grossAmount"
                type="number"
                step="0.01"
                value={grossAmount}
                onChange={(e) =>
                  handleGrossOrRateChange(e.target.value, vatRate)
                }
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatRate">VAT Rate (%) *</Label>
              <Input
                id="vatRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={vatRate}
                onChange={(e) =>
                  handleGrossOrRateChange(grossAmount, e.target.value)
                }
                placeholder="15"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatAmount">VAT Amount *</Label>
              <Input
                id="vatAmount"
                type="number"
                step="0.01"
                value={vatAmount}
                onChange={(e) => setVatAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="space-y-2 max-w-[200px]">
            <Label htmlFor="totalAmount">Total Amount *</Label>
            <Input
              id="totalAmount"
              type="number"
              step="0.01"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="0.00"
              className="font-semibold"
            />
          </div>
        </CardContent>
      </Card>

      {/* Parties */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Parties</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="buyerName">Buyer Name *</Label>
              <Input
                id="buyerName"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Client / buyer name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buyerTaxId">Buyer Tax ID</Label>
              <Input
                id="buyerTaxId"
                value={buyerTaxId}
                onChange={(e) => setBuyerTaxId(e.target.value)}
                placeholder="VAT registration #"
              />
            </div>
          </div>
          <div className="space-y-2 max-w-[300px]">
            <Label htmlFor="sellerTaxId">Seller Tax ID *</Label>
            <Input
              id="sellerTaxId"
              value={sellerTaxId}
              onChange={(e) => setSellerTaxId(e.target.value)}
              placeholder="Your VAT registration #"
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
            router.push(`/projects/${projectId}/commercial/invoices`)
          }
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
