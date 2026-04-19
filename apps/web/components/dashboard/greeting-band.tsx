'use client';

/**
 * Top-of-dashboard greeting band.
 *
 * Surfaces three pieces of context in one compact row:
 *   - Time-of-day greeting + user first name
 *   - Full date
 *   - Inline quick-stat summary (approvals count, unread notifications)
 *
 * No decoration, no orange accent — this is operational context, not
 * celebration. Keeps the top of the page quiet so the priority zone
 * below reads as the real hierarchy anchor.
 */
type GreetingBandProps = {
  userName: string;
  pendingApprovals: number;
  unreadNotifications: number;
};

function timeOfDayGreeting(date = new Date()): string {
  const hours = date.getHours();
  if (hours < 12) return 'Good morning';
  if (hours < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(fullName: string): string {
  const first = fullName.split(/\s+/)[0];
  return first && first.length > 0 ? first : fullName;
}

export function GreetingBand({
  userName,
  pendingApprovals,
  unreadNotifications,
}: GreetingBandProps) {
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const summaryParts: string[] = [];
  if (pendingApprovals > 0) {
    summaryParts.push(
      `${pendingApprovals} ${pendingApprovals === 1 ? 'approval' : 'approvals'} awaiting you`,
    );
  }
  if (unreadNotifications > 0) {
    summaryParts.push(
      `${unreadNotifications} unread ${unreadNotifications === 1 ? 'notification' : 'notifications'}`,
    );
  }
  const summary =
    summaryParts.length > 0 ? summaryParts.join(' \u00B7 ') : 'Your queue is clear.';

  return (
    <div className="flex flex-col gap-1">
      <p className="text-display-section text-foreground">
        {timeOfDayGreeting()}, {firstName(userName)}.
      </p>
      <p className="text-body text-muted-foreground">
        <span>{dateStr}</span>
        <span className="mx-2 text-border-strong">{'\u2022'}</span>
        <span>{summary}</span>
      </p>
    </div>
  );
}
