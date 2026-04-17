'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  FileSearch,
  BarChart3,
  Package,
  FileText,
  Receipt,
  Wallet,
  CreditCard,
  FileSignature,
  FileCheck2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@fmksa/ui/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: 'rfq', label: 'RFQs', icon: FileSearch },
  { href: 'quotations', label: 'Quotations', icon: BarChart3 },
  { href: 'purchase-orders', label: 'Purchase Orders', icon: FileText },
  { href: 'supplier-invoices', label: 'Supplier Invoices', icon: Receipt },
  { href: 'expenses', label: 'Expenses', icon: Wallet },
  { href: 'credit-notes', label: 'Credit Notes', icon: CreditCard },
  { href: 'vendors', label: 'Vendors', icon: Package },
  { href: 'framework-agreements', label: 'Framework Agreements', icon: FileCheck2 },
  { href: 'vendor-contracts', label: 'Vendor Contracts', icon: FileSignature },
];

export function ProcurementSidebar({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const basePath = `/projects/${projectId}/procurement`;

  return (
    <nav className="w-48 shrink-0 space-y-1 hidden md:block">
      <Link
        href={`/projects/${projectId}`}
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground transition-colors mb-1"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Project
      </Link>
      <h3 className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Procurement
      </h3>
      {NAV_ITEMS.map((item) => {
        const href = `${basePath}/${item.href}`;
        const isActive = pathname.startsWith(href);
        const Icon = item.icon;

        if (item.disabled) {
          return (
            <div
              key={item.href}
              className="flex items-center gap-2 rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground/40 cursor-not-allowed"
              title={`${item.label} — coming soon`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              'flex items-center gap-2 rounded-md border-l-2 border-transparent px-3 py-2 text-sm transition-colors',
              isActive
                ? 'border-primary bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
