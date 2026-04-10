export { projectsService } from './service';
export type { CreateProjectInput, UpdateProjectInput } from './service';

export { projectSettingsService } from './settings';

export { projectAssignmentsService } from './assignments';
export type { AssignInput, RevokeInput } from './assignments';

export {
  PROJECT_SETTINGS_DEFAULTS,
  getDefaultSetting,
} from './project-settings-defaults';
export type {
  ProjectSettingKey,
  ProjectSettingValue,
} from './project-settings-defaults';
