/**
 * Project settings defaults — scaffold (Pause #4).
 *
 * Each key maps to a default JSON value used when no project-level override
 * exists. Call `getDefaultSetting(key)` to retrieve a single default or use
 * `PROJECT_SETTINGS_DEFAULTS` for the full map.
 *
 * Categories:
 *  - Workflow toggles
 *  - Material tracking flags
 *  - Document categories enabled
 *  - Notification toggles
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectSettingKey = keyof typeof PROJECT_SETTINGS_DEFAULTS;

export type ProjectSettingValue = string | number | boolean | string[] | null;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

// TODO(ahmed): Review every default value below and adjust for Fun Makers KSA
// operational requirements. Each value is a best-guess starting point.

export const PROJECT_SETTINGS_DEFAULTS = {
  // ---- Workflow toggles ----
  // TODO(ahmed): confirm whether document approval workflows should be on by
  // default for new projects.
  requireDocumentApprovalWorkflow: true,

  // TODO(ahmed): confirm whether material submittal workflow is mandatory.
  requireMaterialSubmittalWorkflow: true,

  // TODO(ahmed): confirm whether shop drawing workflow is mandatory.
  requireShopDrawingWorkflow: true,

  // TODO(ahmed): confirm if procurement requires workflow approval by default.
  requireProcurementWorkflow: true,

  // ---- Material tracking flags ----
  // TODO(ahmed): confirm PM review is required by default for materials.
  defaultRequiresPmReview: true,

  // TODO(ahmed): confirm QA/QC review flag default.
  defaultRequiresQaqcReview: true,

  // TODO(ahmed): confirm whether test certificates are mandatory by default.
  defaultRequiresTestCertificate: false,

  // ---- Document categories enabled ----
  // TODO(ahmed): confirm which document categories are enabled by default.
  enabledDocumentCategories: [
    'shop_drawing',
    'material_submittal',
    'test_certificate',
    'contract_attachment',
    'vendor_document',
    'letter',
    'drawing',
    'specification',
    'general',
  ] as string[],

  // ---- Notification toggles ----
  // TODO(ahmed): confirm notification defaults.
  notifyOnWorkflowStepAssignment: true,
  notifyOnWorkflowCompletion: true,
  notifyOnDocumentUpload: false,
  notifyOnPostingException: true,
} as const satisfies Record<string, ProjectSettingValue>;

// ---------------------------------------------------------------------------
// Accessor
// ---------------------------------------------------------------------------

/**
 * Returns the default value for a given project setting key, or `undefined`
 * if the key is not recognized.
 */
export function getDefaultSetting(
  key: string,
): ProjectSettingValue | undefined {
  if (key in PROJECT_SETTINGS_DEFAULTS) {
    return PROJECT_SETTINGS_DEFAULTS[key as ProjectSettingKey];
  }
  return undefined;
}
