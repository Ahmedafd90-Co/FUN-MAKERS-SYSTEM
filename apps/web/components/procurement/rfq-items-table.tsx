'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@fmksa/ui/components/table';

type RfqItem = {
  id: string;
  itemDescription: string;
  quantity: unknown;
  unit: string;
  estimatedUnitPrice?: unknown;
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

export function RfqItemsTable({ items }: { items: RfqItem[] }) {
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
            <TableHead className="w-[40%]">Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Est. Unit Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="text-sm">{item.itemDescription}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">
                {formatNum(item.quantity)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {item.unit}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm">
                {item.estimatedUnitPrice != null
                  ? formatNum(item.estimatedUnitPrice)
                  : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
