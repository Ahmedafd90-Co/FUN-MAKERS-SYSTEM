'use client';

import { cn } from '@fmksa/ui/lib/utils';
import {
  Users,
  Shield,
  Building2,
  Database,
  GitBranch,
  Bell,
  ScrollText,
  FileWarning,
  Activity,
  ArrowLeftRight,
  HeartPulse,
  AlertCircle,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AdminMobileSidebar } from '@/components/layout/admin-mobile-sidebar';

// ---------------------------------------------------------------------------
// Admin sidebar navigation items
// ---------------------------------------------------------------------------

type AdminNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const adminNavItems: AdminNavItem[] = [
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Roles & Permissions', href: '/admin/roles', icon: Shield },
  // Project Assignments (/admin/assignments) is intentionally hidden
  // from the admin sidebar. The current component is a placeholder stub —
  // it renders one row per project with "-" in User/Role columns rather
  // than real assignment data. Showing it to operators is misleading;
  // hiding it is the honest move until the page is actually wired to
  // query real assignments. The route still resolves, so existing deep
  // links don't break.
  { label: 'Entities', href: '/admin/entities', icon: Building2 },
  { label: 'Reference Data', href: '/admin/reference-data', icon: Database },
  {
    label: 'Workflow Templates',
    href: '/admin/workflow-templates',
    icon: GitBranch,
  },
  {
    label: 'Notification Templates',
    href: '/admin/notification-templates',
    icon: Bell,
  },
  {
    label: 'Audit Log',
    href: '/admin/audit-log',
    icon: ScrollText,
  },
  {
    label: 'Override Log',
    href: '/admin/override-log',
    icon: ArrowLeftRight,
  },
  {
    label: 'Posting Exceptions',
    href: '/admin/posting-exceptions',
    icon: FileWarning,
  },
  {
    label: 'Absorption Exceptions',
    href: '/admin/absorption-exceptions',
    icon: AlertCircle,
  },
  {
    label: 'Sheet Imports',
    href: '/admin/imports',
    icon: Upload,
  },
  {
    label: 'Financial Health',
    href: '/admin/financial-health',
    icon: HeartPulse,
  },
  {
    label: 'System Health',
    href: '/admin/system-health',
    icon: Activity,
  },
];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <div className="px-4 py-4">
          <h2 className="text-sm font-semibold text-foreground tracking-tight">
            Administration
          </h2>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 pb-4">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/');

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <AdminMobileSidebar />
        <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
