export { documentService } from './service';
export { createStorageAdapter } from './storage';
export type { StorageAdapter } from './storage';
export { IntegrityError } from './signatures';
export {
  verifyRecordInProject,
  UnsupportedRecordTypeError,
  RECORD_TYPES_FOR_DOCUMENTS,
  type DocumentRecordType,
} from './verify-record';
// PIC-52 — Drawing Register (Layer 2.5 PR-3)
export * as drawingsService from './drawings';
export {
  DRAWING_REVISION_TRANSITIONS,
  DRAWING_REVISION_TERMINAL_STATUSES,
  DRAWING_REVISION_ACTION_TO_STATUS,
} from './drawings';
