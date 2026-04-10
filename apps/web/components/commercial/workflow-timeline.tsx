'use client';

type TimelineEntry = {
  action: string;
  createdAt: Date | string;
  resourceType?: string;
};

export function WorkflowTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries || entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="mt-1 h-2 w-2 rounded-full bg-muted-foreground/50 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium capitalize">
              {entry.action.replace(/\./g, ' → ').replace(/_/g, ' ')}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(entry.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
