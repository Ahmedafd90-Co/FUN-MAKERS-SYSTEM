'use client';

/**
 * NotificationList — paginated list of notifications for the current user.
 *
 * - Unread notifications are shown bold/highlighted.
 * - Each item shows: subject, body snippet, relative time, status badge.
 * - Clicking "Mark as read" marks the notification read.
 * - "Mark all read" button at the top.
 * - Cursor-based "Load more" pagination.
 */

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { cn } from '@fmksa/ui/lib/utils';
import { BellOff, CheckCheck, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { trpc } from '@/lib/trpc-client';

import { EmptyState } from '@/components/ui/empty-state';

// ---------------------------------------------------------------------------
// Relative-time helper (no external dependency)
// ---------------------------------------------------------------------------

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) !== 1 ? 's' : ''} ago`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationItem = {
  id: string;
  templateCode: string;
  subject: string;
  body: string;
  channel: string;
  status: string;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
};

type NotificationListProps = {
  unreadOnly?: boolean;
};

// ---------------------------------------------------------------------------
// Navigation helper: derive resource URL from notification metadata
// ---------------------------------------------------------------------------

function getResourceUrl(notification: NotificationItem): string | null {
  const code = notification.templateCode;

  // Workflow notifications — step assigned goes to approvals queue,
  // outcome notifications (approved/rejected/returned) also go there
  // since the user may have multiple pending items.
  if (code.startsWith('workflow_')) {
    return '/approvals';
  }

  // Document notifications link to the documents view
  if (code === 'document_signed') {
    return '/documents';
  }

  // Posting exception → admin posting exceptions
  if (code === 'posting_exception') {
    return '/admin/posting-exceptions';
  }

  // System / admin notifications
  if (code === 'user_created' || code === 'user_deactivated') {
    return '/admin/users';
  }

  // Fallback: link to notifications page itself so clicking always does
  // something (mark-as-read at minimum) instead of a dead end.
  return '/notifications';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationList({ unreadOnly = false }: NotificationListProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Accumulated items across pages
  const [allItems, setAllItems] = useState<NotificationItem[]>([]);
  // cursor for the next page
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  // cursor used in the current query (undefined = first page)
  const [queryCursor, setQueryCursor] = useState<string | undefined>(undefined);
  // whether we're in "load more" mode
  const loadMoreRef = useRef(false);

  const { data, isLoading, isFetching } = trpc.notifications.list.useQuery({
    unreadOnly,
    limit: 20,
    cursor: queryCursor,
  });

  // Accumulate pages
  useEffect(() => {
    if (!data) return;
    if (loadMoreRef.current) {
      setAllItems((prev) => [...prev, ...(data.items as NotificationItem[])]);
      loadMoreRef.current = false;
    } else {
      setAllItems(data.items as NotificationItem[]);
    }
    setCursor(data.nextCursor ?? undefined);
  }, [data]);

  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const handleMarkRead = useCallback(
    (notificationId: string) => {
      setMarkingIds((prev) => new Set(prev).add(notificationId));
      markRead
        .mutateAsync({ notificationId })
        .finally(() => {
          setMarkingIds((prev) => {
            const next = new Set(prev);
            next.delete(notificationId);
            return next;
          });
        });
    },
    [markRead],
  );

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      setAllItems([]);
      loadMoreRef.current = false;
      setQueryCursor(undefined);
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  function handleLoadMore() {
    if (!cursor) return;
    loadMoreRef.current = true;
    setQueryCursor(cursor);
  }

  const hasMore = !!cursor;
  const unreadCount = allItems.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {unreadCount} unread
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && allItems.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && allItems.length === 0 && (
        <EmptyState
          icon={BellOff}
          title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
          description={unreadOnly ? "You're all caught up." : 'Notifications will appear here when you receive them.'}
        />
      )}

      {/* Notification list */}
      {allItems.length > 0 && (
        <div className="divide-y divide-border rounded-md border">
          {allItems.map((notification) => {
            const isUnread = !notification.readAt;
            const resourceUrl = getResourceUrl(notification);
            return (
              <div
                key={notification.id}
                role={resourceUrl ? 'button' : undefined}
                tabIndex={resourceUrl ? 0 : undefined}
                className={cn(
                  'flex items-start gap-4 px-4 py-4 transition-colors',
                  isUnread
                    ? 'bg-accent/30 hover:bg-accent/50'
                    : 'hover:bg-muted/30',
                  resourceUrl && 'cursor-pointer',
                )}
                onClick={() => {
                  if (!resourceUrl) return;
                  if (isUnread) {
                    handleMarkRead(notification.id);
                  }
                  router.push(resourceUrl);
                }}
                onKeyDown={(e) => {
                  if (resourceUrl && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    if (isUnread) {
                      handleMarkRead(notification.id);
                    }
                    router.push(resourceUrl);
                  }
                }}
              >
                {/* Unread dot */}
                <div className="mt-1.5 shrink-0">
                  {isUnread ? (
                    <span className="flex h-2 w-2 rounded-full bg-primary" />
                  ) : (
                    <span className="flex h-2 w-2 rounded-full bg-transparent" />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-1">
                  <p
                    className={cn(
                      'text-sm leading-tight',
                      isUnread
                        ? 'font-semibold text-foreground'
                        : 'font-medium text-foreground',
                    )}
                  >
                    {notification.subject}
                  </p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {notification.body}
                  </p>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(notification.createdAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <Badge
                      variant={isUnread ? 'default' : 'secondary'}
                      className="h-4 px-1.5 text-[10px]"
                    >
                      {isUnread ? 'Unread' : 'Read'}
                    </Badge>
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      {notification.channel === 'in_app' ? 'In-app' : 'Email'}
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  {isUnread && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkRead(notification.id);
                      }}
                      disabled={markingIds.has(notification.id)}
                    >
                      Mark read
                    </Button>
                  )}
                  {resourceUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isUnread) {
                          handleMarkRead(notification.id);
                        }
                        router.push(resourceUrl);
                      }}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" />
                      View
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={isFetching}
          >
            {isFetching ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
