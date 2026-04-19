'use client';

import { cn } from '@fmksa/ui/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AdminMobileSidebar } from '@/components/layout/admin-mobile-sidebar';
import {
  ADMIN_NAV_GROUPS,
  isAdminNavItemActive,
} from '@/components/layout/admin-nav-config';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface-elevated">
        <div className="px-4 py-4">
          <h2 className="text-sm font-semibold text-foreground tracking-tight">
            Administration
          </h2>
        </div>
        <nav className="flex-1 px-2 pb-4">
          {ADMIN_NAV_GROUPS.map((group, groupIndex) => (
            <div
              key={group.label}
              className={cn(groupIndex === 0 ? 'mt-1' : 'mt-5')}
            >
              <p className="px-3 pb-1.5 text-label uppercase text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = isAdminNavItemActive(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      // border-l-2 is always present (transparent on inactive) so
                      // the active state adds no horizontal shift.
                      className={cn(
                        'flex items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'border-primary bg-accent text-accent-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
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
