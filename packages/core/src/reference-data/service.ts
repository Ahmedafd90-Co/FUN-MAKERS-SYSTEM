/**
 * Reference data service — countries, currencies, app settings, status
 * dictionaries.
 *
 * Read operations are available to any authenticated user.
 * Write operations require 'reference_data.edit' permission (enforced at
 * the router layer).
 */

import { prisma } from '@fmksa/db';
import { auditService } from '../audit/service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AddStatusDictEntryInput = {
  dictionaryCode: string;
  statusCode: string;
  label: string;
  orderIndex: number;
  colorHint?: string | null | undefined;
  isTerminal: boolean;
  createdBy: string;
};

export type UpdateStatusDictEntryInput = {
  label?: string | undefined;
  orderIndex?: number | undefined;
  colorHint?: string | null | undefined;
  isTerminal?: boolean | undefined;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const referenceDataService = {
  // ---- Read-only (any authenticated user) ----

  /**
   * List all countries.
   */
  async listCountries() {
    return prisma.country.findMany({
      orderBy: { name: 'asc' },
    });
  },

  /**
   * List all currencies.
   */
  async listCurrencies() {
    return prisma.currency.findMany({
      orderBy: { code: 'asc' },
    });
  },

  /**
   * Get a single app setting by key. Returns the parsed value or null.
   */
  async getAppSetting(key: string) {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row) return null;
    return row.valueJson;
  },

  /**
   * Get status dictionary entries for a given dictionary code, ordered by
   * orderIndex.
   */
  async getStatusDictionary(dictionaryCode: string) {
    return prisma.statusDictionary.findMany({
      where: { dictionaryCode },
      orderBy: { orderIndex: 'asc' },
    });
  },

  // ---- Write (requires reference_data.edit permission) ----

  /**
   * Upsert an app setting.
   */
  async setAppSetting(key: string, value: unknown, updatedBy: string) {
    // Get old value for audit
    const oldRow = await prisma.appSetting.findUnique({ where: { key } });
    const oldValue = oldRow ? oldRow.valueJson : null;

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.appSetting.upsert({
        where: { key },
        create: {
          key,
          valueJson: JSON.parse(JSON.stringify(value)),
          updatedBy,
        },
        update: {
          valueJson: JSON.parse(JSON.stringify(value)),
          updatedBy,
        },
      });

      await auditService.log(
        {
          actorUserId: updatedBy,
          actorSource: 'user',
          action: 'app_setting.update',
          resourceType: 'app_setting',
          resourceId: key,
          beforeJson: { key, value: JSON.parse(JSON.stringify(oldValue)) },
          afterJson: { key, value: JSON.parse(JSON.stringify(value)) },
        },
        tx,
      );

      return row;
    });

    return result;
  },

  /**
   * Add a new entry to a status dictionary.
   */
  async addStatusDictEntry(input: AddStatusDictEntryInput) {
    // Check unique (dictionaryCode, statusCode)
    const existing = await prisma.statusDictionary.findUnique({
      where: {
        dictionaryCode_statusCode: {
          dictionaryCode: input.dictionaryCode,
          statusCode: input.statusCode,
        },
      },
    });
    if (existing) {
      throw new Error(
        `Status dictionary entry "${input.dictionaryCode}:${input.statusCode}" already exists.`,
      );
    }

    const entry = await prisma.$transaction(async (tx) => {
      const e = await tx.statusDictionary.create({
        data: {
          dictionaryCode: input.dictionaryCode,
          statusCode: input.statusCode,
          label: input.label,
          orderIndex: input.orderIndex,
          colorHint: input.colorHint ?? null,
          isTerminal: input.isTerminal,
        },
      });

      await auditService.log(
        {
          actorUserId: input.createdBy,
          actorSource: 'user',
          action: 'status_dictionary.create',
          resourceType: 'status_dictionary',
          resourceId: e.id,
          beforeJson: {},
          afterJson: {
            id: e.id,
            dictionaryCode: e.dictionaryCode,
            statusCode: e.statusCode,
            label: e.label,
            orderIndex: e.orderIndex,
            isTerminal: e.isTerminal,
          },
        },
        tx,
      );

      return e;
    });

    return entry;
  },

  /**
   * Update a status dictionary entry. Writes an audit log.
   */
  async updateStatusDictEntry(
    id: string,
    data: UpdateStatusDictEntryInput,
    updatedBy: string,
  ) {
    const entry = await prisma.$transaction(async (tx) => {
      const before = await tx.statusDictionary.findUnique({ where: { id } });
      if (!before) {
        throw new Error(`Status dictionary entry "${id}" not found.`);
      }

      const updated = await tx.statusDictionary.update({
        where: { id },
        data: {
          ...(data.label !== undefined && { label: data.label }),
          ...(data.orderIndex !== undefined && { orderIndex: data.orderIndex }),
          ...(data.colorHint !== undefined && { colorHint: data.colorHint }),
          ...(data.isTerminal !== undefined && { isTerminal: data.isTerminal }),
        },
      });

      await auditService.log(
        {
          actorUserId: updatedBy,
          actorSource: 'user',
          action: 'status_dictionary.update',
          resourceType: 'status_dictionary',
          resourceId: id,
          beforeJson: {
            label: before.label,
            orderIndex: before.orderIndex,
            colorHint: before.colorHint,
            isTerminal: before.isTerminal,
          },
          afterJson: {
            label: updated.label,
            orderIndex: updated.orderIndex,
            colorHint: updated.colorHint,
            isTerminal: updated.isTerminal,
          },
        },
        tx,
      );

      return updated;
    });

    return entry;
  },

  /**
   * Soft-archive a status dictionary entry — never hard delete.
   * We repurpose the entry by marking it with a special label suffix.
   * (StatusDictionary has no status column, so we flag via convention.)
   */
  // Note: The StatusDictionary model has no 'status' or 'archivedAt' column.
  // For now this is a no-op placeholder. In future, add an 'archived'
  // boolean to the model.  For safety we do NOT hard-delete.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async archiveStatusDictEntry(_id: string, _archivedBy: string) {
    throw new Error(
      'archiveStatusDictEntry: StatusDictionary model lacks an archive column. ' +
        'Add an `archived Boolean` field in a future migration.',
    );
  },
};
