'use client';

/**
 * Import upload dialog — posts XLSX/XLSM/XLS multipart form-data to
 * `/api/imports/upload`. tRPC does not handle binary uploads, so this is a
 * direct `fetch(FormData)` call. After a successful stage, the dialog closes,
 * invalidates the batch list, and (if a router is provided) navigates to
 * the new batch detail page.
 *
 * Lifecycle mapping:
 *   - 200 → batch staged, navigate to review queue
 *   - 400 → user-facing validation error (shape / extension / size / parser)
 *   - 403 → permission / project-scope error
 *   - 409 → duplicate file hash for this project + import type
 *   - 500 → surface as generic server error
 */
import { Button } from '@fmksa/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@fmksa/ui/components/dialog';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

type ImportType = 'budget_baseline' | 'ipa_history' | 'ipa_forecast';

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  budget_baseline: 'Budget baseline (BOQ)',
  ipa_history: 'IPA history',
  ipa_forecast: 'IPA forecast',
};

type ImportUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImportUploadDialog({
  open,
  onOpenChange,
}: ImportUploadDialogProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [projectId, setProjectId] = useState<string>('');
  const [importType, setImportType] = useState<ImportType>('budget_baseline');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: projects = [], isLoading: projectsLoading } =
    trpc.projects.list.useQuery(
      { includeArchived: false },
      { enabled: open },
    );

  function reset() {
    setProjectId('');
    setImportType('budget_baseline');
    setFile(null);
    setSubmitting(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      toast.error('Select a project first.');
      return;
    }
    if (!file) {
      toast.error('Select a sheet file to upload.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('projectId', projectId);
      formData.append('importType', importType);
      formData.append('file', file);

      const res = await fetch('/api/imports/upload', {
        method: 'POST',
        body: formData,
      });

      const body = (await res.json().catch(() => null)) as
        | { batchId?: string; totalRows?: number; error?: string; existingBatchId?: string }
        | null;

      if (!res.ok) {
        if (res.status === 409 && body?.existingBatchId) {
          toast.error(body.error ?? 'Duplicate upload.', {
            action: {
              label: 'Open existing',
              onClick: () =>
                router.push(`/admin/imports/${body.existingBatchId}`),
            },
          });
        } else {
          toast.error(body?.error ?? `Upload failed (${res.status}).`);
        }
        return;
      }

      if (!body?.batchId) {
        toast.error('Upload returned an invalid response.');
        return;
      }

      toast.success(`Sheet staged — ${body.totalRows ?? 0} rows.`);
      await utils.import.listAll.invalidate();
      reset();
      onOpenChange(false);
      router.push(`/admin/imports/${body.batchId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) {
          if (!o) reset();
          onOpenChange(o);
        }
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Upload sheet</DialogTitle>
            <DialogDescription>
              Stage a budget baseline or IPA history sheet. Staging never
              touches live data — you will review rows before commit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="upload-project">Project</Label>
            <Select
              value={projectId}
              onValueChange={setProjectId}
              disabled={submitting || projectsLoading}
            >
              <SelectTrigger id="upload-project">
                <SelectValue
                  placeholder={projectsLoading ? 'Loading…' : 'Select project'}
                />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="upload-import-type">Import type</Label>
            <Select
              value={importType}
              onValueChange={(v) => setImportType(v as ImportType)}
              disabled={submitting}
            >
              <SelectTrigger id="upload-import-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(IMPORT_TYPE_LABELS) as ImportType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {IMPORT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="upload-file">Sheet file</Label>
            <Input
              id="upload-file"
              type="file"
              accept=".xlsx,.xlsm,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={submitting}
              required
            />
            <p className="text-xs text-muted-foreground">
              Accepted: .xlsx, .xlsm, .xls. 25 MB max.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !file || !projectId}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Stage sheet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
