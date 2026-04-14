'use client';

import { Settings } from 'lucide-react';

// ---------------------------------------------------------------------------
// App Settings — honest placeholder.
// The configuration system is planned but not yet wired to the backend.
// ---------------------------------------------------------------------------

export function AppSettingsForm() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Settings className="h-10 w-10 text-muted-foreground/40 mb-4" />
      <h3 className="text-sm font-medium">Application Settings</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        System-wide configuration (company name, default currency, session
        timeout, etc.) will be available here once the settings backend is
        implemented.
      </p>
    </div>
  );
}
