/**
 * Import module barrel — sheet-import staging layer.
 *
 * Keep this surface deliberately narrow. UI/tRPC code should rely only on
 * the orchestrator in ./service. Validators, committers, and parse helpers
 * are internal.
 */

export {
  stageBatch,
  validateBatch,
  commitBatch,
  rejectBatch,
  cancelBatch,
  excludeRow,
  listBatches,
  getBatch,
  DuplicateImportError,
  StaleValidationError,
  ImportBatchNotReadyError,
} from './service';

export type {
  ImportIssue,
  ImportConflict,
  ValidatedRow,
  ImportBatchSummary,
  ParsedBudgetBaselineRow,
  ParsedIpaHistoryRow,
  RowCommitResult,
} from './types';

export type {
  ReferenceSnapshot,
  BudgetReferenceSnapshot,
  IpaReferenceSnapshot,
} from './reference-snapshot';

export { PARSER_VERSIONS, VALIDATOR_SCHEMA_VERSIONS } from './versions';
