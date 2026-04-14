'use client';

import { Building2 } from 'lucide-react';

type RfqVendor = {
  vendorId: string;
  vendor: {
    id: string;
    name: string;
    code?: string | null;
  };
};

export function RfqVendorsList({ vendors }: { vendors: RfqVendor[] }) {
  if (vendors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No vendors invited.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {vendors.map((rv) => (
        <li
          key={rv.vendorId}
          className="flex items-center gap-2 text-sm"
        >
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium">{rv.vendor.name}</span>
          {rv.vendor.code && (
            <span className="text-muted-foreground">({rv.vendor.code})</span>
          )}
        </li>
      ))}
    </ul>
  );
}
