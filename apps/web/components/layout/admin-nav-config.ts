import {
  Activity,
  AlertCircle,
  ArrowLeftRight,
  Bell,
  Building2,
  Database,
  FileWarning,
  FolderKanban,
  GitBranch,
  HeartPulse,
  ScrollText,
  Shield,
  Upload,
  Users,
} from 'lucide-react';

export type AdminNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

// Shared source of truth for the admin sidebar. Desktop and mobile both read
// from this so the two stay in sync — previous drift left Absorption
// Exceptions and Financial Health missing from the mobile menu.
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: 'Access',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users },
      { label: 'Roles', href: '/admin/roles', icon: Shield },
      { label: 'Assignments', href: '/admin/assignments', icon: FolderKanban },
    ],
  },
  {
    label: 'Organization',
    items: [
      { label: 'Entities', href: '/admin/entities', icon: Building2 },
      { label: 'Reference Data', href: '/admin/reference-data', icon: Database },
    ],
  },
  {
    label: 'Configuration',
    items: [
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
    ],
  },
  {
    label: 'Operations',
    items: [
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
      { label: 'Sheet Imports', href: '/admin/imports', icon: Upload },
      { label: 'Audit Log', href: '/admin/audit-log', icon: ScrollText },
      { label: 'Override Log', href: '/admin/override-log', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Platform',
    items: [
      {
        label: 'Financial Health',
        href: '/admin/financial-health',
        icon: HeartPulse,
      },
      { label: 'System Health', href: '/admin/system-health', icon: Activity },
    ],
  },
];

export function isAdminNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}
