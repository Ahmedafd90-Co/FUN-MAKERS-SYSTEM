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
