'use client';

/**
 * ExportMenu — tiny dropdown that offers XLSX + CSV download from a route
 * handler under /api/exports/*.
 *
 * Usage:
 *   <ExportMenu
 *     endpoint="/api/exports/budget"
 *     query={{ projectId }}
 *     label="Export"
 *   />
 *
 * The component builds two URLs (format=xlsx and format=csv) and opens them
 * in a new tab. The route handler streams the file with an
 * attachment Content-Disposition, so the browser downloads instead of
 * navigating. No client-side workbook / csv logic here — all formatting is
 * owned by the server route handler so there is one source of truth per
 * surface.
 */
import { Button } from '@fmksa/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@fmksa/ui/components/dropdown-menu';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';

type ExportMenuProps = {
  /** Path to the export route handler, e.g. "/api/exports/budget". */
  endpoint: string;
  /** Query string params to include (projectId is typical). */
  query?: Record<string, string | number | null | undefined>;
  /** Button label. Defaults to "Export". */
  label?: string;
  /**
   * When true, the button is rendered but disabled (tooltip shows a reason).
   * Used on the Admin Absorption Exceptions page until a project filter is
   * selected, since the export is project-scoped.
   */
  disabled?: boolean;
  /** Disabled-state tooltip text. */
  disabledReason?: string;
};

function buildUrl(
  endpoint: string,
  query: ExportMenuProps['query'],
  format: 'xlsx' | 'csv',
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v == null || v === '') continue;
    params.set(k, String(v));
  }
  params.set('format', format);
  return `${endpoint}?${params.toString()}`;
}

export function ExportMenu({
  endpoint,
  query,
  label = 'Export',
  disabled = false,
  disabledReason,
}: ExportMenuProps) {
  if (disabled) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title={disabledReason ?? 'Export unavailable'}
        className="gap-1.5"
      >
        <Download className="h-3.5 w-3.5" />
        {label}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem asChild>
          <a
            href={buildUrl(endpoint, query, 'xlsx')}
            // No target="_blank" — the attachment disposition triggers a
            // download from the current tab and keeps focus.
            download
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
            Download .xlsx
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={buildUrl(endpoint, query, 'csv')}
            download
          >
            <FileText className="h-3.5 w-3.5 mr-2" />
            Download .csv
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
