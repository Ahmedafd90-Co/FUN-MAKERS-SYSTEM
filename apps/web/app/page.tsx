const modules = [
  { id: 1, name: 'Shared Core Platform', status: 'In Progress' },
  { id: 2, name: 'Commercial Management', status: 'Planned' },
  { id: 3, name: 'Procurement & Subcontracts', status: 'Planned' },
  { id: 4, name: 'Materials & Inventory', status: 'Planned' },
  { id: 5, name: 'Budget & Cost Control', status: 'Planned' },
  { id: 6, name: 'Cashflow & Finance Bridge', status: 'Planned' },
  { id: 7, name: 'Reports & PMO KPIs', status: 'Planned' },
] as const;

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <article className="w-full max-w-lg rounded-lg border border-border bg-card p-8 shadow-sm">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-accent-foreground">
            Pico Play Fun Makers KSA
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            boot OK &mdash; Module 1 scaffold
          </p>
        </header>

        <div className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Platform Modules
          </h2>

          <ul className="mt-3 space-y-2" role="list">
            {modules.map((m) => (
              <li
                key={m.id}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                  m.status === 'In Progress'
                    ? 'border-border bg-background text-foreground'
                    : 'border-transparent text-muted-foreground'
                }`}
              >
                <span>
                  {m.id}. {m.name}
                </span>
                {m.status === 'In Progress' ? (
                  <span className="inline-flex items-center rounded-full bg-status-draft/15 px-2.5 py-0.5 text-xs font-medium text-status-draft">
                    Scaffold
                  </span>
                ) : (
                  <span className="text-xs">{m.status}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <footer className="mt-8 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Internal operations platform &mdash; construction &amp; project delivery, KSA.
          </p>
        </footer>
      </article>
    </main>
  );
}
