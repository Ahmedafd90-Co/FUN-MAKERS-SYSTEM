'use client';

/**
 * Admin > Notification Templates — list and edit notification templates.
 * Task 1.8.9
 *
 * Uses simple string replacement for live preview (no Handlebars on the client).
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Label } from '@fmksa/ui/components/label';
import { Separator } from '@fmksa/ui/components/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@fmksa/ui/components/sheet';
import { Textarea } from '@fmksa/ui/components/textarea';
import { useState } from 'react';
import { toast, Toaster } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Sample payload for the live preview
// ---------------------------------------------------------------------------

const SAMPLE_PAYLOAD: Record<string, string> = {
  recipientName: 'Ahmed Al-Dossary',
  projectName: 'Sample Project',
  projectCode: 'PROJ-001',
  stepName: 'Finance Review',
  entityName: 'Fun Makers KSA LLC',
  documentTitle: 'Contract Agreement',
  approverName: 'Sarah Al-Zahrawi',
  reason: 'Pending review',
  link: 'https://app.example.com/projects/PROJ-001',
  date: new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }),
};

/**
 * Simple string replacement preview — replaces {{variable}} with sample values.
 * Does NOT run Handlebars on the client (avoids adding the dependency).
 */
function renderPreview(template: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return SAMPLE_PAYLOAD[key] ?? `[${key}]`;
  });
}

// ---------------------------------------------------------------------------
// Template row type
// ---------------------------------------------------------------------------

type Template = {
  id: string;
  code: string;
  channel: string;
  subjectTemplate: string;
  bodyTemplate: string;
  defaultEnabled: boolean;
};

// ---------------------------------------------------------------------------
// Edit sheet
// ---------------------------------------------------------------------------

type EditSheetProps = {
  template: Template | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function EditSheet({ template, open, onOpenChange }: EditSheetProps) {
  const utils = trpc.useUtils();
  const [subject, setSubject] = useState(template?.subjectTemplate ?? '');
  const [body, setBody] = useState(template?.bodyTemplate ?? '');

  // Sync local state when template changes (sheet re-opens for a different item)
  const [lastTemplateId, setLastTemplateId] = useState<string | null>(null);
  if (template && template.id !== lastTemplateId) {
    setSubject(template.subjectTemplate);
    setBody(template.bodyTemplate);
    setLastTemplateId(template.id);
  }

  const updateMutation = trpc.notifications.templates.update.useMutation({
    onSuccess: () => {
      toast.success('Template updated.');
      utils.notifications.templates.list.invalidate();
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });

  function handleSave() {
    if (!template) return;
    updateMutation.mutate({
      code: template.code,
      subjectTemplate: subject,
      bodyTemplate: body,
    });
  }

  if (!template) return null;

  const previewSubject = renderPreview(subject);
  const previewBody = renderPreview(body);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="px-6 py-5">
          <SheetTitle className="font-mono text-sm">{template.code}</SheetTitle>
          <SheetDescription>
            Edit the subject and body templates. Use{' '}
            <code className="rounded bg-muted px-1 font-mono text-xs">
              {'{{variableName}}'}
            </code>{' '}
            for dynamic values.
          </SheetDescription>
        </SheetHeader>

        <Separator />

        <div className="flex-1 space-y-6 px-6 py-5">
          {/* Subject template */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject template</Label>
            <Textarea
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              rows={2}
              className="font-mono text-sm"
              placeholder="e.g. Action required: {{stepName}} on {{projectName}}"
            />
          </div>

          {/* Body template */}
          <div className="space-y-2">
            <Label htmlFor="body">Body template</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="font-mono text-sm"
              placeholder="Hello {{recipientName}},&#10;&#10;..."
            />
          </div>

          <Separator />

          {/* Live preview */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Live preview (sample data)
            </p>
            <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Subject</p>
              <p className="text-sm font-semibold">{previewSubject || '—'}</p>
            </div>
            <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Body</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {previewBody || '—'}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        <SheetFooter className="px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NotificationTemplatesPage() {
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: templates, isLoading } = trpc.notifications.templates.list.useQuery();

  function openEdit(template: Template) {
    setEditingTemplate(template);
    setSheetOpen(true);
  }

  return (
    <>
      <Toaster position="top-right" />

      <div className="space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Notification Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage the subject and body templates for system notifications.
            Changes take effect immediately for new notifications.
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && (!templates || templates.length === 0) && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No notification templates found.
          </p>
        )}

        {/* Table */}
        {!isLoading && templates && templates.length > 0 && (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Channel
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Subject
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Default
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {templates.map((tmpl) => (
                  <tr
                    key={tmpl.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium">
                        {tmpl.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">
                        {tmpl.channel === 'in_app' ? 'In-app' : 'Email'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">
                      {tmpl.subjectTemplate}
                    </td>
                    <td className="px-4 py-3">
                      {tmpl.defaultEnabled ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        >
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(tmpl)}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EditSheet
        template={editingTemplate}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
