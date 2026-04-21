/**
 * Unit tests for the IPA-forecast sheet validator.
 *
 * The validator is pure — it takes a raw row + a reference snapshot and
 * returns errors / warnings / conflict / parsedJson. No DB access. We
 * exercise every path the sheet-import review queue depends on so the
 * conflict-and-error UI never drifts from the contract.
 */
import { describe, it, expect } from 'vitest';

import { validateIpaForecastRow } from '../../src/import/validators/ipa-forecast';
import type { IpaForecastReferenceSnapshot } from '../../src/import/reference-snapshot';

const SNAPSHOT_EMPTY: IpaForecastReferenceSnapshot = {
  kind: 'ipa_forecast',
  existingForecasts: [],
};

const SNAPSHOT_WITH_P1: IpaForecastReferenceSnapshot = {
  kind: 'ipa_forecast',
  existingForecasts: [
    {
      id: 'existing-1',
      periodNumber: 1,
      periodStart: '2026-01-01T00:00:00.000Z',
    },
  ],
};

describe('validateIpaForecastRow', () => {
  it('accepts a well-formed row', () => {
    const result = validateIpaForecastRow(
      2,
      {
        period_number: '3',
        period_start: '2026-04-01',
        forecast_amount: '3500000',
        notes: 'April forecast',
      },
      SNAPSHOT_EMPTY,
    );
    expect(result.errors).toEqual([]);
    expect(result.conflict).toBeNull();
    expect(result.parsedJson).toEqual({
      periodNumber: 3,
      periodStart: '2026-04-01',
      forecastAmount: '3500000.00',
      notes: 'April forecast',
    });
  });

  it('flags required missing fields', () => {
    const result = validateIpaForecastRow(3, {}, SNAPSHOT_EMPTY);
    const codes = result.errors.map((e) => e.code).sort();
    expect(codes).toContain('required_missing');
    expect(result.parsedJson).toBeNull();
  });

  it('rejects zero / negative period_number', () => {
    const result = validateIpaForecastRow(
      4,
      { period_number: '0', period_start: '2026-01-01', forecast_amount: '1' },
      SNAPSHOT_EMPTY,
    );
    expect(result.errors.some((e) => e.code === 'invalid_int')).toBe(true);
  });

  it('rejects negative forecast_amount', () => {
    const result = validateIpaForecastRow(
      5,
      {
        period_number: '1',
        period_start: '2026-01-01',
        forecast_amount: '-100',
      },
      SNAPSHOT_EMPTY,
    );
    expect(result.errors.some((e) => e.code === 'negative_amount')).toBe(true);
  });

  it('rejects non-numeric forecast_amount', () => {
    const result = validateIpaForecastRow(
      6,
      {
        period_number: '1',
        period_start: '2026-01-01',
        forecast_amount: 'five million',
      },
      SNAPSHOT_EMPTY,
    );
    expect(result.errors.some((e) => e.code === 'invalid_number')).toBe(true);
  });

  it('surfaces a conflict when period_number already exists in the project', () => {
    const result = validateIpaForecastRow(
      7,
      {
        period_number: '1',
        period_start: '2026-01-01',
        forecast_amount: '100000',
      },
      SNAPSHOT_WITH_P1,
    );
    expect(result.errors).toEqual([]);
    expect(result.conflict).toEqual({
      type: 'ipa_forecast_period_number',
      existingForecastId: 'existing-1',
      existingPeriodNumber: 1,
    });
  });

  it('case-insensitive header tolerance — PERIOD_NUMBER etc.', () => {
    const result = validateIpaForecastRow(
      8,
      {
        PERIOD_NUMBER: '2',
        'Period Start': '2026-02-01',
        'FORECAST_AMOUNT': '1,200,000',
      },
      SNAPSHOT_EMPTY,
    );
    expect(result.errors).toEqual([]);
    expect(result.parsedJson).toEqual({
      periodNumber: 2,
      periodStart: '2026-02-01',
      forecastAmount: '1200000.00',
      notes: null,
    });
  });

  it('coerces m/d/yyyy dates to yyyy-mm-dd', () => {
    const result = validateIpaForecastRow(
      9,
      {
        period_number: '1',
        period_start: '3/15/2026',
        forecast_amount: '1',
      },
      SNAPSHOT_EMPTY,
    );
    expect(result.parsedJson?.periodStart).toBe('2026-03-15');
  });

  it('rejects an unparseable date', () => {
    const result = validateIpaForecastRow(
      10,
      {
        period_number: '1',
        period_start: 'not-a-date',
        forecast_amount: '1',
      },
      SNAPSHOT_EMPTY,
    );
    expect(result.errors.some((e) => e.code === 'invalid_date')).toBe(true);
  });
});
