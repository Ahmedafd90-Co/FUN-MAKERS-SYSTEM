/**
 * Notification user preferences — Task 1.8.3
 *
 * - getPreferences: returns full preference map for a user, falling back to
 *   each template's defaultEnabled value when no explicit preference exists.
 * - setPreference: upserts a single preference + writes an audit log entry.
 */

import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { NotificationChannel } from './service';

export type PreferenceKey = {
  templateCode: string;
  channel: NotificationChannel;
};

export type PreferenceEntry = PreferenceKey & {
  enabled: boolean;
  /** True when the value comes from the template default (no explicit row). */
  isDefault: boolean;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the full preference map for a user.
 *
 * For each (templateCode, channel) combination that exists in the
 * `notification_templates` table, look for an explicit preference row for
 * this user. If no row exists, fall back to the template's `defaultEnabled`.
 */
export async function getPreferences(
  userId: string,
): Promise<PreferenceEntry[]> {
  const [templates, explicitPrefs] = await Promise.all([
    prisma.notificationTemplate.findMany({
      select: { code: true, channel: true, defaultEnabled: true },
    }),
    prisma.notificationPreference.findMany({
      where: { userId },
    }),
  ]);

  const prefMap = new Map(
    explicitPrefs.map((p) => [`${p.templateCode}:${p.channel}`, p.enabled]),
  );

  return templates.map((t) => {
    const key = `${t.code}:${t.channel}`;
    const hasExplicit = prefMap.has(key);
    return {
      templateCode: t.code,
      channel: t.channel as NotificationChannel,
      enabled: hasExplicit ? (prefMap.get(key) as boolean) : t.defaultEnabled,
      isDefault: !hasExplicit,
    };
  });
}

/**
 * Upsert a single preference for a user.
 *
 * Writes an audit log entry recording the before/after state.
 */
export async function setPreference(
  userId: string,
  templateCode: string,
  channel: NotificationChannel,
  enabled: boolean,
): Promise<void> {
  // Read the current state for the audit log
  const existing = await prisma.notificationPreference.findUnique({
    where: { userId_templateCode_channel: { userId, templateCode, channel } },
  });

  await (prisma as any).$transaction(async (tx: any) => {
    await tx.notificationPreference.upsert({
      where: {
        userId_templateCode_channel: { userId, templateCode, channel },
      },
      create: { userId, templateCode, channel, enabled },
      update: { enabled },
    });

    await auditService.log(
      {
        actorUserId: userId,
        actorSource: 'user',
        action: 'notification_preference_updated',
        resourceType: 'notification_preference',
        resourceId: `${userId}:${templateCode}:${channel}`,
        beforeJson: existing
          ? { enabled: existing.enabled }
          : { enabled: null },
        afterJson: { enabled },
      },
      tx,
    );
  });
}

/**
 * Check whether a user has a given channel + template enabled.
 *
 * Falls back to the template's `defaultEnabled` when no explicit preference
 * exists. Returns `true` if the template is not found (fail-open).
 */
export async function isPreferenceEnabled(
  userId: string,
  templateCode: string,
  channel: NotificationChannel,
): Promise<boolean> {
  const [explicit, template] = await Promise.all([
    prisma.notificationPreference.findUnique({
      where: { userId_templateCode_channel: { userId, templateCode, channel } },
    }),
    prisma.notificationTemplate.findUnique({
      where: { code: templateCode },
      select: { defaultEnabled: true },
    }),
  ]);

  if (explicit !== null) return explicit.enabled;
  // No explicit preference — use template default (or true if template missing)
  return template?.defaultEnabled ?? true;
}
