'use client';

import { cn } from '@fmksa/ui/lib/utils';

/**
 * Quotation comparison table — the centerpiece of the procurement review slice.
 *
 * Layout: rows = RFQ items, columns = vendors.
 * Each cell shows unitPrice and totalPrice from the vendor's quotation for that item.
 * The lowest price per item row is highlighted.
 *
 * Design principles (operator-first doctrine):
 * - Clear, fast to scan — no decoration
 * - Vendor names as sticky column headers
 * - Lowest price highlighted per row (green)
 * - No edit capability — read and compare only
 */

type VendorPrice = {
  vendorId: string;
  vendorName: string;
  quotationId: string;
  unitPrice: number | null;
  totalPrice: number | null;
  quantity: number | null;
};

type ComparisonRow = {
  rfqItem: {
    id: string;
    itemDescription: string;
    quantity: number;
    unit: string;
  };
  vendors: VendorPrice[];
};

function formatNum(val: number | null): string {
  if (val === null || val === undefined) return '-';
  return val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function findLowestUnitPrice(vendors: VendorPrice[]): string | null {
  let lowest: number | null = null;
  let lowestVendorId: string | null = null;
  for (const v of vendors) {
    if (v.unitPrice !== null && (lowest === null || v.unitPrice < lowest)) {
      lowest = v.unitPrice;
      lowestVendorId = v.vendorId;
    }
  }
  return lowestVendorId;
}

export function QuotationComparisonTable({
  comparison,
}: {
  comparison: ComparisonRow[];
}) {
  if (comparison.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No items to compare.
      </p>
    );
  }

  // Collect unique vendors from all rows
  const vendorMap = new Map<string, string>();
  for (const row of comparison) {
    for (const v of row.vendors) {
      if (!vendorMap.has(v.vendorId)) {
        vendorMap.set(v.vendorId, v.vendorName);
      }
    }
  }
  const vendors = Array.from(vendorMap.entries());

  if (vendors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No quotations received yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-3 font-medium text-muted-foreground sticky left-0 bg-background min-w-[200px]">
              Item
            </th>
            <th className="text-right py-3 px-3 font-medium text-muted-foreground w-[70px]">
              Qty
            </th>
            <th className="text-left py-3 px-3 font-medium text-muted-foreground w-[60px]">
              Unit
            </th>
            {vendors.map(([vendorId, vendorName]) => (
              <th
                key={vendorId}
                className="text-right py-3 px-3 font-medium min-w-[140px]"
              >
                {vendorName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.map((row) => {
            const lowestVendorId = findLowestUnitPrice(row.vendors);

            return (
              <tr key={row.rfqItem.id} className="border-b last:border-b-0">
                <td className="py-3 px-3 font-medium sticky left-0 bg-background">
                  {row.rfqItem.itemDescription}
                </td>
                <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">
                  {formatNum(row.rfqItem.quantity)}
                </td>
                <td className="py-3 px-3 text-muted-foreground">
                  {row.rfqItem.unit}
                </td>
                {vendors.map(([vendorId]) => {
                  const vendorData = row.vendors.find(
                    (v) => v.vendorId === vendorId,
                  );
                  const isLowest =
                    vendorData?.unitPrice !== null &&
                    lowestVendorId === vendorId;

                  return (
                    <td
                      key={vendorId}
                      className={cn(
                        'py-3 px-3 text-right tabular-nums',
                        isLowest && 'text-green-700 dark:text-green-400 font-medium',
                      )}
                    >
                      {vendorData ? (
                        <div>
                          <div>{formatNum(vendorData.unitPrice)}</div>
                          {vendorData.totalPrice !== null && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Total: {formatNum(vendorData.totalPrice)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>

        {/* Vendor totals row */}
        <tfoot>
          <tr className="border-t-2">
            <td
              colSpan={3}
              className="py-3 px-3 font-semibold sticky left-0 bg-background"
            >
              Total
            </td>
            {vendors.map(([vendorId]) => {
              let sum = 0;
              let hasAny = false;
              for (const row of comparison) {
                const vendorData = row.vendors.find(
                  (v) => v.vendorId === vendorId,
                );
                if (vendorData?.totalPrice !== null && vendorData?.totalPrice !== undefined) {
                  sum += vendorData.totalPrice;
                  hasAny = true;
                }
              }
              return (
                <td
                  key={vendorId}
                  className="py-3 px-3 text-right tabular-nums font-semibold"
                >
                  {hasAny ? formatNum(sum) : '-'}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
