'use client';

import { Button } from '@fmksa/ui/components/button';
import { Bell, LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { trpc } from '@/lib/trpc-client';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

type UserMenuProps = {
  userName: string;
  userEmail: string;
};

export function UserMenu({ userName, userEmail }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const signOutMutation = trpc.auth.signOut.useMutation({
    onSuccess: () => {
      router.push('/sign-in');
      router.refresh();
    },
  });

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', handleEsc);
    }
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground transition-opacity hover:opacity-80"
        aria-label="User menu"
        aria-expanded={open}
      >
        {getInitials(userName)}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border bg-card shadow-lg z-50">
          {/* User info header */}
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">
              {userEmail}
            </p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link
              href="/profile"
              className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              onClick={() => setOpen(false)}
            >
              <User className="h-4 w-4 text-muted-foreground" />
              Profile
            </Link>
            <Link
              href="/home"
              className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              onClick={() => setOpen(false)}
            >
              <Bell className="h-4 w-4 text-muted-foreground" />
              Notifications
              <span className="ml-auto text-xs text-muted-foreground">
                Soon
              </span>
            </Link>
          </div>

          {/* Sign out */}
          <div className="border-t border-border py-1">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent rounded-none h-auto font-normal"
              onClick={() => {
                setOpen(false);
                signOutMutation.mutate();
              }}
              disabled={signOutMutation.isPending}
            >
              <LogOut className="h-4 w-4 text-muted-foreground" />
              {signOutMutation.isPending ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
