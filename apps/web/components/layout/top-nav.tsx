'use client';

import { Button } from '@fmksa/ui/components/button';
import { cn } from '@fmksa/ui/lib/utils';
import { Menu, Search, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { NotificationBell } from '@/components/notifications/notification-bell';

import { UserMenu } from './user-menu';

// ---------------------------------------------------------------------------
// Navigation items
// ---------------------------------------------------------------------------

type NavItem = {
  label: string;
  href: string;
  active: boolean;
  placeholder?: string; // "Coming in Module X"
};

function getNavItems(
  pathname: string,
  permissions: string[],
): NavItem[] {
  const isAdmin = permissions.includes('system.admin');

  const items: NavItem[] = [
    { label: 'Home', href: '/home', active: pathname.startsWith('/home') },
    {
      label: 'My Approvals',
      href: '/approvals',
      active: pathname.startsWith('/approvals'),
    },
    {
      label: 'Projects',
      href: '/projects',
      active: pathname.startsWith('/projects'),
    },
    {
      label: 'Documents',
      href: '/documents',
      active: pathname.startsWith('/documents'),
      placeholder: 'Coming in Module 1.4',
    },
  ];

  // Admin link — only for users with system.admin
  if (isAdmin) {
    items.push({
      label: 'Admin',
      href: '/admin/users',
      active: pathname.startsWith('/admin'),
    });
  }

  return items;
}

// Future module nav items — rendered as subtle placeholders.
// Commercial and Procurement are project-scoped modules accessed via project workspace,
// so they do NOT appear here.
const futureModuleItems: Array<{ label: string; module: string }> = [
  { label: 'Materials', module: 'Module 4' },
  { label: 'Budget', module: 'Module 5' },
  { label: 'Cashflow', module: 'Module 6' },
  { label: 'Reports', module: 'Module 7' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type TopNavProps = {
  userName: string;
  userEmail: string;
  permissions: string[];
};

export function TopNav({ userName, userEmail, permissions }: TopNavProps) {
  const pathname = usePathname();
  const navItems = getNavItems(pathname, permissions);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac/.test(navigator.userAgent));
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-elevated/95 backdrop-blur supports-[backdrop-filter]:bg-surface-elevated/70">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center px-4 lg:px-6">
        {/* Left: Branding */}
        <Link
          href="/home"
          aria-label="Pico Play — Home"
          className="mr-6 flex items-center shrink-0"
        >
          <Image
            src="/logo-colour.png"
            alt="Pico Play"
            width={120}
            height={32}
            priority
            className="h-8 w-auto dark:hidden"
          />
          <Image
            src="/logo-colour-white.png"
            alt="Pico Play"
            width={120}
            height={32}
            priority
            className="hidden h-8 w-auto dark:block"
          />
        </Link>

        {/* Center: Nav items (desktop) */}
        <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0">
          {navItems.map((item) =>
            item.placeholder ? (
              <span
                key={item.label}
                className={cn(
                  'relative flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors cursor-default',
                  'text-muted-foreground/60',
                )}
                title={item.placeholder}
              >
                {item.label}
                <span className="text-[10px] text-muted-foreground/30">Soon</span>
              </span>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'relative px-3 py-1.5 text-sm rounded-md transition-colors',
                  item.active
                    ? "bg-accent text-accent-foreground font-medium after:pointer-events-none after:absolute after:inset-x-3 after:bottom-1 after:h-[2px] after:rounded-full after:bg-primary"
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                {item.label}
              </Link>
            ),
          )}

          {/* Future module placeholders — very subtle */}
          <div className="hidden lg:flex items-center gap-1 ml-2 border-l border-border pl-2">
            {futureModuleItems.map((item) => (
              <span
                key={item.label}
                className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground/40 cursor-default"
                title={`Coming in ${item.module}`}
              >
                {item.label}
                <span className="text-[10px] text-muted-foreground/30">Soon</span>
              </span>
            ))}
          </div>
        </nav>

        {/* Right: Search trigger + Notification bell + User menu (desktop) */}
        <div className="hidden md:flex items-center gap-2 ml-4">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-48 justify-start text-xs text-muted-foreground"
            onClick={() => {
              document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
              );
            }}
          >
            <Search className="mr-2 h-3.5 w-3.5" />
            Search...
            <kbd className="ml-auto rounded border bg-muted px-1.5 text-[10px] font-medium">
              {isMac ? '⌘' : 'Ctrl+'}K
            </kbd>
          </Button>
          <NotificationBell />
          <UserMenu userName={userName} userEmail={userEmail} />
        </div>

        {/* Mobile hamburger */}
        <div className="flex md:hidden ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileMenuOpen && (
        <div className="border-t border-border bg-background md:hidden">
          <nav className="flex flex-col px-4 py-3 space-y-1">
            {navItems.map((item) =>
              item.placeholder ? (
                <span
                  key={item.label}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground/60 cursor-default"
                  title={item.placeholder}
                >
                  {item.label}
                  <span className="text-[10px] text-muted-foreground/30">Soon</span>
                </span>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    'px-3 py-2.5 text-sm rounded-md transition-colors',
                    item.active
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="border-t border-border px-4 py-3">
            <UserMenu userName={userName} userEmail={userEmail} />
          </div>
        </div>
      )}
    </header>
  );
}
