/**
 * Reference data tRPC router — countries, currencies, app settings,
 * status dictionaries.
 */
import {
  GetAppSettingSchema,
  SetAppSettingSchema,
  GetStatusDictSchema,
  AddStatusDictEntrySchema,
  UpdateStatusDictEntrySchema,
} from '@fmksa/contracts';
import { referenceDataService } from '@fmksa/core';
import { accessControlService } from '@fmksa/core';
import { router, protectedProcedure, adminProcedure } from '../trpc';

// ---------------------------------------------------------------------------
// Sub-routers
// ---------------------------------------------------------------------------

const countriesRouter = router({
  list: protectedProcedure.query(async () => {
    return referenceDataService.listCountries();
  }),
});

const currenciesRouter = router({
  list: protectedProcedure.query(async () => {
    return referenceDataService.listCurrencies();
  }),
});

const appSettingsRouter = router({
  get: protectedProcedure
    .input(GetAppSettingSchema)
    .query(async ({ input }) => {
      return referenceDataService.getAppSetting(input.key);
    }),

  set: adminProcedure
    .input(SetAppSettingSchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'reference_data.edit',
      );
      return referenceDataService.setAppSetting(
        input.key,
        input.value,
        ctx.user.id,
      );
    }),
});

const statusDictsRouter = router({
  get: protectedProcedure
    .input(GetStatusDictSchema)
    .query(async ({ input }) => {
      return referenceDataService.getStatusDictionary(input.dictionaryCode);
    }),

  add: adminProcedure
    .input(AddStatusDictEntrySchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'reference_data.edit',
      );
      return referenceDataService.addStatusDictEntry({
        dictionaryCode: input.dictionaryCode,
        statusCode: input.statusCode,
        label: input.label,
        orderIndex: input.orderIndex,
        colorHint: input.colorHint ?? null,
        isTerminal: input.isTerminal,
        createdBy: ctx.user.id,
      });
    }),

  update: adminProcedure
    .input(UpdateStatusDictEntrySchema)
    .mutation(async ({ ctx, input }) => {
      await accessControlService.requirePermission(
        ctx.user.id,
        'reference_data.edit',
      );
      const { id, ...rest } = input;
      return referenceDataService.updateStatusDictEntry(
        id,
        {
          label: rest.label,
          orderIndex: rest.orderIndex,
          colorHint: rest.colorHint,
          isTerminal: rest.isTerminal,
        },
        ctx.user.id,
      );
    }),
});

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

export const referenceDataRouter = router({
  countries: countriesRouter,
  currencies: currenciesRouter,
  appSettings: appSettingsRouter,
  statusDicts: statusDictsRouter,
});
