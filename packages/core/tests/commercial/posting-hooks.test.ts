import { describe, it, expect } from 'vitest';
import { registerCommercialEventTypes } from '../../src/commercial/posting-hooks/register';
import { getEventSchema } from '../../src/posting/event-registry';

describe('commercial posting hooks', () => {
  registerCommercialEventTypes();

  const EVENT_TYPES = [
    'IPA_APPROVED',
    'IPC_SIGNED',
    'VARIATION_APPROVED_INTERNAL',
    'VARIATION_APPROVED_CLIENT',
    'TAX_INVOICE_ISSUED',
    'CLAIM_ISSUED',
    'BACK_CHARGE_ISSUED',
  ];

  for (const eventType of EVENT_TYPES) {
    it(`registers ${eventType} with a valid schema`, () => {
      const schema = getEventSchema(eventType);
      expect(schema).toBeDefined();
    });
  }

  it('IPA_APPROVED schema validates correct payload', () => {
    const schema = getEventSchema('IPA_APPROVED');
    const result = schema.parse({
      ipaId: 'test-id', periodNumber: 1, grossAmount: '1000.00',
      retentionAmount: '100.00', netClaimed: '900.00', currency: 'SAR', projectId: 'proj-1',
    });
    expect(result).toBeDefined();
  });

  it('IPA_APPROVED schema rejects missing required fields', () => {
    const schema = getEventSchema('IPA_APPROVED');
    expect(() => schema.parse({ ipaId: 'test-id' })).toThrow();
  });
});
