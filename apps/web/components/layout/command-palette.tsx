'use client';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@fmksa/ui/components/command';
import {
  Home,
  ClipboardList,
  FolderKanban,
  Bell,
  User,
  Users,
  Shield,
  Building2,
  Database,
  GitBranch,
  ScrollText,
  ArrowLeftRight,
  FileWarning,
  Activity,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useCommandPalette } from '@/hooks/use-command-palette';

// ---------------------------------------------------------------------------
// Navigation items
// ---------------------------------------------------------------------------

const navItems = [
  { label: 'Home', href: '/home', icon: Home },
  { label: 'My Approvals', href: '/approvals', icon: ClipboardList },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Profile', href: '/profile', icon: User },
];

const adminItems = [
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Roles & Permissions', href: '/admin/roles', icon: Shield },
  { label: 'Entities', href: '/admin/entities', icon: Building2 },
  { label: 'Reference Data', href: '/admin/reference-data', icon: Database },
  { label: 'Workflow Templates', href: '/admin/workflow-templates', icon: GitBranch },
  { label: 'Notification Templates', href: '/admin/notification-templates', icon: Bell },
  { label: 'Audit Log', href: '/admin/audit-log', icon: ScrollText },
  { label: 'Override Log', href: '/admin/override-log', icon: ArrowLeftRight },
  { label: 'Posting Exceptions', href: '/admin/posting-exceptions', icon: FileWarning },
  { label: 'System Health', href: '/admin/system-health', icon: Activity },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type CommandPaletteProps = {
  permissions: string[];
};

export function CommandPalette({ permissions }: CommandPaletteProps) {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const isAdmin = permissions.includes('system.admin');

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                onSelect={() => navigate(item.href)}
              >
                <Icon />
                <span>{item.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {isAdmin && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Administration">
              {adminItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    onSelect={() => navigate(item.href)}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
