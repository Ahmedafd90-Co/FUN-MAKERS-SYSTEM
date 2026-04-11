import { registerEventType } from '../../posting/event-registry';
import {
  PO_ISSUED_SCHEMA, PO_DELIVERED_SCHEMA, SUPPLIER_INVOICE_APPROVED_SCHEMA,
  EXPENSE_APPROVED_SCHEMA, CREDIT_NOTE_APPLIED_SCHEMA,
  VENDOR_CONTRACT_SIGNED_SCHEMA, FRAMEWORK_AGREEMENT_ACTIVE_SCHEMA,
} from './schemas';

let registered = false;

export function registerProcurementEventTypes(): void {
  if (registered) return;
  registered = true;

  registerEventType('PO_ISSUED', PO_ISSUED_SCHEMA);
  registerEventType('PO_DELIVERED', PO_DELIVERED_SCHEMA);
  registerEventType('SUPPLIER_INVOICE_APPROVED', SUPPLIER_INVOICE_APPROVED_SCHEMA);
  registerEventType('EXPENSE_APPROVED', EXPENSE_APPROVED_SCHEMA);
  registerEventType('CREDIT_NOTE_APPLIED', CREDIT_NOTE_APPLIED_SCHEMA);
  registerEventType('VENDOR_CONTRACT_SIGNED', VENDOR_CONTRACT_SIGNED_SCHEMA);
  registerEventType('FRAMEWORK_AGREEMENT_ACTIVE', FRAMEWORK_AGREEMENT_ACTIVE_SCHEMA);
}
