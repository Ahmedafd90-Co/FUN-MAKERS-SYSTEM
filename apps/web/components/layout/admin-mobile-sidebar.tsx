'use client';

import { Button } from '@fmksa/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@fmksa/ui/components/sheet';
import { cn } from '@fmksa/ui/lib/utils';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import {
  ADMIN_NAV_GROUPS,
  isAdminNavItemActive,
} from '@/components/layout/admin-nav-config';

export function AdminMobileSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Menu className="h-4 w-4" />
            <span className="sr-only">Open admin menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-4 py-4 border-b border-border">
            <SheetTitle className="text-sm font-semibold tracking-tight">
              Administration
            </SheetTitle>
          </SheetHeader>
          <nav className="flex-1 px-2 py-3">
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
                        onClick={() => setOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
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
                </div>
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
      <span className="text-sm font-medium text-foreground">Administration</span>
    </div>
  );
}
