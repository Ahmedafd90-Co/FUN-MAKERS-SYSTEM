'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@fmksa/ui/components/table';

type LineItem = {
  id: string;
  itemDescription: string;
  quantity: unknown;
  unit: string;
  unitPrice: unknown;
  totalPrice: unknown;
  currency: string;
  notes?: string | null;
};

function formatNum(val: unknown): string {
  const num =
    typeof val === 'string'
      ? parseFloat(val)
      : typeof val === 'number'
        ? val
        : 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function QuotationLineItems({
  items,
  currency,
}: {
  items: LineItem[];
  currency: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No line items.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[35%]">Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="text-sm">
                {item.itemDescription}
                {item.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.notes}
                  </p>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm">
                {formatNum(item.quantity)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.unit}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm">
                {formatNum(item.unitPrice)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm font-medium">
                {formatNum(item.totalPrice)} {currency}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
