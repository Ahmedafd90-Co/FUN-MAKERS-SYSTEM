'use client';

/**
 * EvidenceDrawer — WS1 / Phase A
 *
 * Consolidated "show me the proof" slide-over for a single business record.
 * Pulls from existing services via their existing tRPC surfaces (plus the
 * two thin projections added in this phase: `audit.forRecord`,
 * `posting.events.forRecord`). No new business logic, no schema reshape.
 *
 * Sections:
 *   • Attachments summary — count only; the full list lives on the page.
 *   • Workflow — actions from `workflow.instances.getByRecord`.
 *   • Ledger — posting events produced by this record.
 *   • Audit — last N AuditLog entries scoped to resourceType+resourceId.
 *
 * Deliberately read-only. Overrides / linked-records upstream discovery /
 * required-attachment enforcement are explicit phase-later work.
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@fmksa/ui/components/sheet';
import { cn } from '@fmksa/ui/lib/utils';
import {
  Activity,
  GitBranch,
  Paperclip,
  ScrollText,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function humanizeAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent/40"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        {summary && (
          <span className="shrink-0 text-xs text-muted-foreground">{summary}</span>
        )}
      </button>
      {open && <div className="border-t border-border px-3 py-3">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type EvidenceDrawerProps = {
  projectId: string;
  recordType: string;
  recordId: string;
  recordLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EvidenceDrawer({
  projectId,
  recordType,
  recordId,
  recordLabel,
  open,
  onOpenChange,
}: EvidenceDrawerProps) {
  // Only fetch when the drawer is open — avoid upfront network for every
  // detail-page render. Queries run in parallel once `open === true`.
  const enabled = open;

  const attachments = trpc.documents.list.useQuery(
    { projectId, recordType, recordId, skip: 0, take: 50 },
    { enabled },
  );

  const workflow = trpc.workflow.instances.getByRecord.useQuery(
    { recordType, recordId },
    { enabled },
  );

  const ledger = trpc.posting.events.forRecord.useQuery(
    {
      projectId,
      sourceRecordType: recordType,
      sourceRecordId: recordId,
      take: 20,
    },
    { enabled },
  );

  const audit = trpc.audit.forRecord.useQuery(
    { projectId, resourceType: recordType, resourceId: recordId, take: 10 },
    { enabled },
  );

  const attachmentsCount = attachments.data?.total ?? 0;
  const signedCount =
    attachments.data?.items.filter((d) => d.currentVersion?.isSigned).length ?? 0;
  const workflowActionCount = workflow.data?.actions.length ?? 0;
  const ledgerCount = ledger.data?.items.length ?? 0;
  const auditCount = audit.data?.total ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader className="space-y-1 pr-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Evidence
          </p>
          <SheetTitle className="text-lg">{recordLabel}</SheetTitle>
          <SheetDescription className="text-xs">
            Consolidated view of the attachments, workflow trail, ledger
            events, and audit entries that back this record.
          </SheetDescription>
        </SheetHeader>

        <SheetClose asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </SheetClose>

        <div className="mt-3 space-y-3 overflow-y-auto pr-1">
          {/* Attachments summary */}
          <Section
            icon={Paperclip}
            title="Attachments"
            summary={
              <>
                {attachmentsCount} file{attachmentsCount === 1 ? '' : 's'}
                {signedCount > 0 && (
                  <span className="ml-1">· {signedCount} signed</span>
                )}
              </>
            }
          >
            {attachments.isLoading && (
              <p className="text-xs text-muted-foreground">Loading...</p>
            )}
            {!attachments.isLoading && attachmentsCount === 0 && (
              <p className="text-xs text-muted-foreground">
                No attachments on this record yet. Use the Attachments panel on
                the page to upload the supporting documents.
              </p>
            )}
            {!attachments.isLoading && attachmentsCount > 0 && (
              <ul className="space-y-1.5 text-xs">
                {attachments.data?.items.slice(0, 6).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-foreground">{d.title}</span>
                    <Badge variant="subtle" className="font-normal">
                      {d.currentVersion ? `v${d.currentVersion.versionNo}` : '—'}
                      {d.currentVersion?.isSigned && (
                        <ShieldCheck className="ml-1 h-3 w-3 text-status-signed" />
                      )}
                    </Badge>
                  </li>
                ))}
                {attachmentsCount > 6 && (
                  <li className="text-[11px] text-muted-foreground">
                    + {attachmentsCount - 6} more — see the Attachments panel.
                  </li>
                )}
              </ul>
            )}
          </Section>

          {/* Workflow */}
          <Section
            icon={GitBranch}
            title="Workflow"
            summary={
              workflow.data
                ? `${workflowActionCount} action${workflowActionCount === 1 ? '' : 's'}`
                : undefined
            }
          >
            {workflow.isLoading && (
              <p className="text-xs text-muted-foreground">Loading...</p>
            )}
            {!workflow.isLoading && workflow.data == null && (
              <p className="text-xs text-muted-foreground">
                This record has no workflow instance yet.
              </p>
            )}
            {!workflow.isLoading && workflow.data && workflow.data.actions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Workflow started but no actions recorded yet.
              </p>
            )}
            {!workflow.isLoading && workflow.data && workflow.data.actions.length > 0 && (
              <ul className="space-y-2 text-xs">
                {workflow.data.actions.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        {humanizeAction(a.action)}
                        {a.step?.name && (
                          <span className="ml-1 text-muted-foreground">
                            · {a.step.name}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {a.actor?.name ?? 'Unknown'} ·{' '}
                        {formatDateTime(a.actedAt)}
                      </div>
                      {a.comment && (
                        <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                          "{a.comment}"
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Ledger */}
          <Section
            icon={Activity}
            title="Ledger"
            summary={
              ledgerCount > 0
                ? `${ledgerCount} event${ledgerCount === 1 ? '' : 's'}`
                : undefined
            }
          >
            {ledger.isLoading && (
              <p className="text-xs text-muted-foreground">Loading...</p>
            )}
            {!ledger.isLoading && ledgerCount === 0 && (
              <p className="text-xs text-muted-foreground">
                This record has not posted any ledger events yet.
              </p>
            )}
            {!ledger.isLoading && ledgerCount > 0 && (
              <ul className="space-y-2 text-xs">
                {ledger.data?.items.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">
                        {e.eventType}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {e.origin === 'imported_historical' ? 'historical' : 'live'}
                        {' · '}
                        {formatDateTime(e.postedAt ?? e.createdAt)}
                      </div>
                      {e.exceptions.filter((x) => x.resolvedAt == null).length > 0 && (
                        <div className="mt-0.5 text-[11px] text-destructive">
                          Open exception
                        </div>
                      )}
                    </div>
                    <Badge
                      variant={e.status === 'posted' ? 'secondary' : 'outline'}
                      className={cn(
                        'shrink-0 font-normal',
                        e.status === 'posted' && 'bg-status-approved/15 text-status-approved',
                        e.status === 'failed' && 'bg-destructive/10 text-destructive',
                      )}
                    >
                      {e.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Audit */}
          <Section
            icon={ScrollText}
            title="Audit"
            summary={
              auditCount > 0
                ? `${auditCount} entr${auditCount === 1 ? 'y' : 'ies'}`
                : undefined
            }
          >
            {audit.isLoading && (
              <p className="text-xs text-muted-foreground">Loading...</p>
            )}
            {!audit.isLoading && (audit.data?.items.length ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground">
                No audit entries for this record.
              </p>
            )}
            {!audit.isLoading && (audit.data?.items.length ?? 0) > 0 && (
              <ul className="space-y-1.5 text-xs">
                {audit.data?.items.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-foreground">
                        {a.action}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {a.actorName ?? a.actorSource} ·{' '}
                        {formatDateTime(a.createdAt)}
                      </div>
                    </div>
                  </li>
                ))}
                {auditCount > (audit.data?.items.length ?? 0) && (
                  <li className="text-[11px] text-muted-foreground">
                    Showing {audit.data?.items.length} of {auditCount}.
                  </li>
                )}
              </ul>
            )}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
