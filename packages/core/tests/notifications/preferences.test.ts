/**
 * Tests for notification preferences — Task 1.8.3
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@fmksa/db';
import {
  getPreferences,
  setPreference,
  isPreferenceEnabled,
} from '../../src/notifications/preferences';

const ts = `pref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

let testUser: { id: string };

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `notif-pref-${ts}@test.com`,
      name: 'Pref Test User',
      passwordHash: 'hash',
      status: 'active',
    },
  });
});

afterAll(async () => {
  // Clean up preferences then user
  await prisma.notificationPreference.deleteMany({ where: { userId: testUser.id } });
  // Remove notifications created during tests
  await (prisma as any).$executeRaw`DELETE FROM notifications WHERE user_id = ${testUser.id}`;
  await (prisma as any).$executeRaw`DELETE FROM audit_logs WHERE actor_user_id = ${testUser.id}`;
  await prisma.user.delete({ where: { id: testUser.id } });
});

describe('getPreferences', () => {
  it('returns defaults when no explicit preferences are set', async () => {
    const prefs = await getPreferences(testUser.id);
    // All 6 templates should appear
    expect(prefs.length).toBeGreaterThanOrEqual(6);
    // All should have isDefault = true initially
    expect(prefs.every((p) => p.isDefault)).toBe(true);
    // All seeded templates default to enabled = true
    expect(prefs.every((p) => p.enabled)).toBe(true);
  });

  it('reflects explicit overrides', async () => {
    await setPreference(testUser.id, 'workflow_step_assigned', 'in_app', false);

    const prefs = await getPreferences(testUser.id);
    const pref = prefs.find(
      (p) =>
        p.templateCode === 'workflow_step_assigned' &&
        p.channel === 'in_app',
    );
    expect(pref).toBeDefined();
    expect(pref!.enabled).toBe(false);
    expect(pref!.isDefault).toBe(false);

    // Clean up
    await prisma.notificationPreference.deleteMany({
      where: {
        userId: testUser.id,
        templateCode: 'workflow_step_assigned',
        channel: 'in_app',
      },
    });
  });
});

describe('setPreference', () => {
  it('upserts a preference and can be read back', async () => {
    await setPreference(testUser.id, 'workflow_approved', 'email', false);

    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_templateCode_channel: {
          userId: testUser.id,
          templateCode: 'workflow_approved',
          channel: 'email',
        },
      },
    });

    expect(pref).not.toBeNull();
    expect(pref!.enabled).toBe(false);
  });

  it('updates an existing preference', async () => {
    await setPreference(testUser.id, 'workflow_approved', 'email', true);

    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_templateCode_channel: {
          userId: testUser.id,
          templateCode: 'workflow_approved',
          channel: 'email',
        },
      },
    });

    expect(pref!.enabled).toBe(true);
  });

  it('writes an audit log entry', async () => {
    const before = await prisma.auditLog.count({
      where: {
        actorUserId: testUser.id,
        action: 'notification_preference_updated',
        resourceId: `${testUser.id}:document_signed:in_app`,
      },
    });

    await setPreference(testUser.id, 'document_signed', 'in_app', false);

    const after = await prisma.auditLog.count({
      where: {
        actorUserId: testUser.id,
        action: 'notification_preference_updated',
        resourceId: `${testUser.id}:document_signed:in_app`,
      },
    });

    expect(after).toBe(before + 1);
  });
});

describe('isPreferenceEnabled', () => {
  it('returns true when no explicit preference (template default = true)', async () => {
    const result = await isPreferenceEnabled(
      testUser.id,
      'user_invited',
      'in_app',
    );
    expect(result).toBe(true);
  });

  it('returns false when explicitly disabled', async () => {
    await setPreference(testUser.id, 'posting_exception', 'in_app', false);

    const result = await isPreferenceEnabled(
      testUser.id,
      'posting_exception',
      'in_app',
    );
    expect(result).toBe(false);
  });

  it('returns true (fail-open) for unknown template', async () => {
    const result = await isPreferenceEnabled(
      testUser.id,
      'nonexistent_template_xyz',
      'in_app',
    );
    expect(result).toBe(true);
  });
});
