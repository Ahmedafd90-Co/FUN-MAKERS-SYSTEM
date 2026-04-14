/**
 * Workflow engine — generic, record-type agnostic.
 *
 * The workflow engine knows NOTHING about IPA, IPC, RFQ, documents, or any
 * business record type. It operates on opaque (recordType, recordId) pairs.
 * Later modules register their record types by creating templates.
 */

export { workflowTemplateService } from './templates';
export { TemplateNotFoundError, DuplicateTemplateCodeError } from './templates';

export { workflowInstanceService } from './instances';
export {
  InstanceNotFoundError,
  DuplicateInstanceError,
  TemplateNotActiveError,
  ProjectNotFoundError,
} from './instances';
export type { SlaInfo } from './instances';

export { workflowStepService } from './steps';
export {
  StepMismatchError,
  NotAValidApproverError,
  InvalidInstanceStatusError,
  InvalidReturnStepError,
} from './steps';

export {
  resolveApprovers,
  isValidApprover,
  NoApproversFoundError,
} from './approver-resolution';

export { resolveTemplateCode, resolveTemplate } from './template-resolution';
export type { ResolutionSource, TemplateResolution } from './template-resolution';

export { registerConvergenceHandlers } from './convergence-handlers';

export * as workflowEvents from './events';
