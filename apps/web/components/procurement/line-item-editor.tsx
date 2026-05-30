'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@fmksa/ui/components/table';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RfqLineItem = {
  itemDescription: string;
  unit: string;
  quantity: number;
  estimatedUnitPrice?: number;
  itemCatalogId?: string;
};

export type QuotationLineItem = {
  itemDescription: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  rfqItemId?: string;
  notes?: string;
};

// ---------------------------------------------------------------------------
// RFQ Line Item Editor
// ---------------------------------------------------------------------------

type RfqLineItemEditorProps = {
  items: RfqLineItem[];
  onChange: (items: RfqLineItem[]) => void;
};

const EMPTY_RFQ_ITEM: RfqLineItem = {
  itemDescription: '',
  unit: '',
  quantity: 0,
};

export function RfqLineItemEditor({ items, onChange }: RfqLineItemEditorProps) {
  const addRow = () => onChange([...items, { ...EMPTY_RFQ_ITEM }]);

  const removeRow = (idx: number) => {
    const next = [...items];
    next.splice(idx, 1);
    onChange(next);
  };

  const update = (idx: number, field: keyof RfqLineItem, raw: string) => {
    const next = [...items];
    const item = { ...next[idx]! };
    if (field === 'quantity' || field === 'estimatedUnitPrice') {
      item[field] = raw === '' ? 0 : Number(raw);
    } else {
      // Narrowed: 'itemDescription' | 'unit' | 'itemCatalogId' — all string-typed.
      item[field] = raw;
    }
    next[idx] = item;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Description</TableHead>
              <TableHead className="w-[100px]">Unit</TableHead>
              <TableHead className="w-[100px] text-right">Qty</TableHead>
              <TableHead className="w-[130px] text-right">Est. Unit Price</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                  No line items. Click &quot;Add Item&quot; to start.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Input
                      value={item.itemDescription}
                      onChange={(e) => update(idx, 'itemDescription', e.target.value)}
                      placeholder="Item description"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.unit}
                      onChange={(e) => update(idx, 'unit', e.target.value)}
                      placeholder="e.g. ton"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={item.quantity || ''}
                      onChange={(e) => update(idx, 'quantity', e.target.value)}
                      className="h-8 text-sm text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={item.estimatedUnitPrice ?? ''}
                      onChange={(e) => update(idx, 'estimatedUnitPrice', e.target.value)}
                      placeholder="Optional"
                      className="h-8 text-sm text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(idx)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add Item
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quotation Line Item Editor
// ---------------------------------------------------------------------------

type QuotationLineItemEditorProps = {
  items: QuotationLineItem[];
  onChange: (items: QuotationLineItem[]) => void;
};

const EMPTY_QUOTATION_ITEM: QuotationLineItem = {
  itemDescription: '',
  unit: '',
  quantity: 0,
  unitPrice: 0,
  totalPrice: 0,
};

export function QuotationLineItemEditor({ items, onChange }: QuotationLineItemEditorProps) {
  const addRow = () => onChange([...items, { ...EMPTY_QUOTATION_ITEM }]);

  const removeRow = (idx: number) => {
    const next = [...items];
    next.splice(idx, 1);
    onChange(next);
  };

  const update = (idx: number, field: keyof QuotationLineItem, raw: string) => {
    const next = [...items];
    const item = { ...next[idx]! };

    if (field === 'quantity' || field === 'unitPrice' || field === 'totalPrice') {
      item[field] = raw === '' ? 0 : Number(raw);
      // Auto-calc totalPrice when quantity or unitPrice changes
      if (field === 'quantity' || field === 'unitPrice') {
        item.totalPrice = Math.round(item.quantity * item.unitPrice * 100) / 100;
      }
    } else {
      // Narrowed: 'itemDescription' | 'unit' | 'rfqItemId' | 'notes' — all string-typed.
      item[field] = raw;
    }
    next[idx] = item;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Description</TableHead>
              <TableHead className="w-[80px]">Unit</TableHead>
              <TableHead className="w-[90px] text-right">Qty</TableHead>
              <TableHead className="w-[110px] text-right">Unit Price</TableHead>
              <TableHead className="w-[110px] text-right">Total</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  No line items. Click &quot;Add Item&quot; to start.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Input
                      value={item.itemDescription}
                      onChange={(e) => update(idx, 'itemDescription', e.target.value)}
                      placeholder="Item description"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.unit}
                      onChange={(e) => update(idx, 'unit', e.target.value)}
                      placeholder="e.g. ton"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={item.quantity || ''}
                      onChange={(e) => update(idx, 'quantity', e.target.value)}
                      className="h-8 text-sm text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={item.unitPrice || ''}
                      onChange={(e) => update(idx, 'unitPrice', e.target.value)}
                      className="h-8 text-sm text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-medium">
                    {item.totalPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(idx)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add Item
      </Button>
    </div>
  );
}
