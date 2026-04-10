'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  FileBadge,
  GitBranch,
  Calculator,
  Receipt,
  Mail,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: 'ipa', label: 'IPA', icon: FileText },
  { href: 'ipc', label: 'IPC', icon: FileBadge },
  { href: 'variations', label: 'Variations', icon: GitBranch },
  { href: 'cost-proposals', label: 'Cost Proposals', icon: Calculator },
  { href: 'invoices', label: 'Tax Invoices', icon: Receipt },
  { href: 'correspondence', label: 'Correspondence', icon: Mail },
];

export function CommercialSidebar({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const basePath = `/projects/${projectId}/commercial`;

  return (
    <nav className="hidden md:flex flex-col gap-1 w-48 shrink-0 py-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const fullPath = `${basePath}/${href}`;
        const isActive = pathname === fullPath || pathname.startsWith(`${fullPath}/`);

        return (
          <Link
            key={href}
            href={fullPath}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-secondary text-secondary-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
