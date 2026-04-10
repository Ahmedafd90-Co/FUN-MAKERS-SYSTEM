'use client';

/**
 * NotificationPreferences — per-template, per-channel toggle grid.
 *
 * Rows = notification templates (grouped by unique templateCode).
 * Columns = channels: in_app, email.
 * Each toggle calls trpc.notifications.setPreference.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@fmksa/ui/components/card';
import { cn } from '@fmksa/ui/lib/utils';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Channel labels
// ---------------------------------------------------------------------------

const CHANNEL_LABELS: Record<string, string> = {
  in_app: 'In-app',
  email: 'Email',
};

const CHANNELS = ['in_app', 'email'] as const;
type Channel = (typeof CHANNELS)[number];

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------

type ToggleProps = {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
};

function Toggle({ checked, disabled = false, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationPreferences() {
  const utils = trpc.useUtils();
  const { data: preferences, isLoading } = trpc.notifications.getPreferences.useQuery();

  const setPreference = trpc.notifications.setPreference.useMutation({
    onSuccess: () => {
      utils.notifications.getPreferences.invalidate();
    },
  });

  if (isLoading) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!preferences || preferences.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No notification templates configured.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Build a map: templateCode → { channel → enabled }
  const templateCodes = Array.from(
    new Set(preferences.map((p) => p.templateCode)),
  ).sort();

  const prefMap = new Map<string, Map<Channel, boolean>>();
  for (const p of preferences) {
    if (!prefMap.has(p.templateCode)) {
      prefMap.set(p.templateCode, new Map());
    }
    prefMap.get(p.templateCode)!.set(p.channel as Channel, p.enabled);
  }

  function formatCode(code: string): string {
    return code
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>
          Choose which notifications you receive and how they are delivered.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Header row */}
        <div className="mb-2 grid grid-cols-[1fr_5rem_5rem] gap-2 border-b border-border pb-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Notification
          </span>
          {CHANNELS.map((ch) => (
            <span
              key={ch}
              className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {CHANNEL_LABELS[ch]}
            </span>
          ))}
        </div>

        {/* Preference rows */}
        <div className="divide-y divide-border">
          {templateCodes.map((code) => {
            const channelMap = prefMap.get(code);
            return (
              <div
                key={code}
                className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 py-3"
              >
                <span className="text-sm">{formatCode(code)}</span>
                {CHANNELS.map((ch) => {
                  const isEnabled = channelMap?.get(ch) ?? false;
                  const hasChannel = channelMap?.has(ch) ?? false;
                  if (!hasChannel) {
                    // Channel not available for this template
                    return (
                      <div key={ch} className="flex justify-center">
                        <span className="text-xs text-muted-foreground/40">—</span>
                      </div>
                    );
                  }
                  return (
                    <div key={ch} className="flex justify-center">
                      <Toggle
                        checked={isEnabled}
                        disabled={setPreference.isPending}
                        label={`${formatCode(code)} via ${CHANNEL_LABELS[ch]}`}
                        onChange={(enabled) =>
                          setPreference.mutate({
                            templateCode: code,
                            channel: ch,
                            enabled,
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
