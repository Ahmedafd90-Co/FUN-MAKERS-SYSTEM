'use client';

import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import { useState } from 'react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Known app settings and their types
// ---------------------------------------------------------------------------

type SettingDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean';
  description: string;
};

const KNOWN_SETTINGS: SettingDef[] = [
  {
    key: 'company_name',
    label: 'Company Name',
    type: 'text',
    description: 'The display name of the organization.',
  },
  {
    key: 'default_currency',
    label: 'Default Currency',
    type: 'text',
    description: 'Default currency code for new projects (e.g. SAR).',
  },
  {
    key: 'max_upload_size_mb',
    label: 'Max Upload Size (MB)',
    type: 'number',
    description: 'Maximum file upload size in megabytes.',
  },
  {
    key: 'enable_dark_mode',
    label: 'Enable Dark Mode',
    type: 'boolean',
    description: 'Allow users to switch to dark mode.',
  },
  {
    key: 'session_timeout_hours',
    label: 'Session Timeout (hours)',
    type: 'number',
    description: 'How long a session remains valid.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppSettingsForm() {
  // In Phase 1.4 we render the form with known setting keys.
  // The actual values would come from trpc.referenceData.appSettings.get
  // for each key. For now we use local state as a working prototype.

  const [values, setValues] = useState<Record<string, string | number | boolean>>({
    company_name: 'Fun Makers KSA',
    default_currency: 'SAR',
    max_upload_size_mb: 50,
    enable_dark_mode: true,
    session_timeout_hours: 24,
  });

  const [saving, setSaving] = useState(false);

  function handleChange(key: string, value: string | number | boolean) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setSaving(true);
    // In production: call trpc.referenceData.appSettings.set for each changed key
    setTimeout(() => {
      toast.success('App settings saved.');
      setSaving(false);
    }, 500);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6">
        {KNOWN_SETTINGS.map((setting) => (
          <div key={setting.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={setting.key}>{setting.label}</Label>
            </div>
            <p className="text-xs text-muted-foreground">{setting.description}</p>
            {setting.type === 'boolean' ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={values[setting.key] as boolean}
                  onChange={(e) => handleChange(setting.key, e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-sm">
                  {values[setting.key] ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            ) : setting.type === 'number' ? (
              <Input
                id={setting.key}
                type="number"
                value={values[setting.key] as number}
                onChange={(e) => handleChange(setting.key, Number(e.target.value))}
                className="max-w-xs"
              />
            ) : (
              <Input
                id={setting.key}
                type="text"
                value={values[setting.key] as string}
                onChange={(e) => handleChange(setting.key, e.target.value)}
                className="max-w-md"
              />
            )}
          </div>
        ))}
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </Button>
    </div>
  );
}
