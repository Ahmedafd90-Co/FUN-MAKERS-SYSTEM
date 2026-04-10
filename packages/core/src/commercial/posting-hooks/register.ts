import { registerEventType } from '../../posting/event-registry';
import {
  IPA_APPROVED_SCHEMA, IPC_SIGNED_SCHEMA, VARIATION_APPROVED_INTERNAL_SCHEMA,
  VARIATION_APPROVED_CLIENT_SCHEMA, TAX_INVOICE_ISSUED_SCHEMA,
  CLAIM_ISSUED_SCHEMA, BACK_CHARGE_ISSUED_SCHEMA,
} from './schemas';

let registered = false;

export function registerCommercialEventTypes(): void {
  if (registered) return;
  registered = true;

  registerEventType('IPA_APPROVED', IPA_APPROVED_SCHEMA);
  registerEventType('IPC_SIGNED', IPC_SIGNED_SCHEMA);
  registerEventType('VARIATION_APPROVED_INTERNAL', VARIATION_APPROVED_INTERNAL_SCHEMA);
  registerEventType('VARIATION_APPROVED_CLIENT', VARIATION_APPROVED_CLIENT_SCHEMA);
  registerEventType('TAX_INVOICE_ISSUED', TAX_INVOICE_ISSUED_SCHEMA);
  registerEventType('CLAIM_ISSUED', CLAIM_ISSUED_SCHEMA);
  registerEventType('BACK_CHARGE_ISSUED', BACK_CHARGE_ISSUED_SCHEMA);
}
