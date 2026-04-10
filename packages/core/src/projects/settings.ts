/**
 * Project settings service — get / set / list project-level settings.
 *
 * Settings are stored as key-value pairs in the project_settings table.
 * When a key has no project-level override, the default from
 * project-settings-defaults.ts is returned.
 */

import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';
import {
  PROJECT_SETTINGS_DEFAULTS,
  getDefaultSetting,
  type ProjectSettingValue,
} from './project-settings-defaults';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const projectSettingsService = {
  /**
   * Get a single setting for a project. Returns the project-level value
   * if set, otherwise the default.
   */
  async getSetting(
    projectId: string,
    key: string,
  ): Promise<ProjectSettingValue | undefined> {
    const row = await prisma.projectSetting.findUnique({
      where: { projectId_key: { projectId, key } },
    });

    if (row) {
      return row.valueJson as ProjectSettingValue;
    }

    return getDefaultSetting(key);
  },

  /**
   * Set (upsert) a project-level setting. Writes an audit log entry.
   */
  async setSetting(
    projectId: string,
    key: string,
    value: ProjectSettingValue,
    updatedBy: string,
  ) {
    const now = new Date();

    // Read old value for audit
    const oldRow = await prisma.projectSetting.findUnique({
      where: { projectId_key: { projectId, key } },
    });
    const oldValue = oldRow
      ? (oldRow.valueJson as ProjectSettingValue)
      : getDefaultSetting(key);

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.projectSetting.upsert({
        where: { projectId_key: { projectId, key } },
        create: {
          projectId,
          key,
          valueJson: JSON.parse(JSON.stringify(value)),
          updatedAt: now,
          updatedBy,
        },
        update: {
          valueJson: JSON.parse(JSON.stringify(value)),
          updatedAt: now,
          updatedBy,
        },
      });

      await auditService.log(
        {
          actorUserId: updatedBy,
          actorSource: 'user',
          action: 'project_setting.update',
          resourceType: 'project_setting',
          resourceId: `${projectId}:${key}`,
          projectId,
          beforeJson: { key, value: oldValue ?? null },
          afterJson: { key, value },
        },
        tx,
      );

      return row;
    });

    return result;
  },

  /**
   * Get all settings for a project, merged with defaults. Project-level
   * overrides take precedence.
   */
  async getAllSettings(
    projectId: string,
  ): Promise<Record<string, ProjectSettingValue>> {
    const rows = await prisma.projectSetting.findMany({
      where: { projectId },
    });

    // Start with defaults
    const merged: Record<string, ProjectSettingValue> = {
      ...PROJECT_SETTINGS_DEFAULTS,
    };

    // Override with project-level values
    for (const row of rows) {
      merged[row.key] = row.valueJson as ProjectSettingValue;
    }

    return merged;
  },
};
