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
import {
  Menu,
  Users,
  Shield,
  FolderKanban,
  Building2,
  Database,
  GitBranch,
  Bell,
  ScrollText,
  FileWarning,
  Activity,
  ArrowLeftRight,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const adminNavItems = [
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Roles & Permissions', href: '/admin/roles', icon: Shield },
  { label: 'Project Assignments', href: '/admin/assignments', icon: FolderKanban },
  { label: 'Entities', href: '/admin/entities', icon: Building2 },
  { label: 'Reference Data', href: '/admin/reference-data', icon: Database },
  { label: 'Workflow Templates', href: '/admin/workflow-templates', icon: GitBranch },
  { label: 'Notification Templates', href: '/admin/notification-templates', icon: Bell },
  { label: 'Audit Log', href: '/admin/audit-log', icon: ScrollText },
  { label: 'Override Log', href: '/admin/override-log', icon: ArrowLeftRight },
  { label: 'Posting Exceptions', href: '/admin/posting-exceptions', icon: FileWarning },
  { label: 'System Health', href: '/admin/system-health', icon: Activity, stub: true },
];

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
          <nav className="flex-1 space-y-0.5 px-2 py-3">
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + '/');

              if (item.stub) {
                return (
                  <span
                    key={item.href}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground/50 cursor-default"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
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
          </nav>
        </SheetContent>
      </Sheet>
      <span className="text-sm font-medium text-foreground">Administration</span>
    </div>
  );
}
