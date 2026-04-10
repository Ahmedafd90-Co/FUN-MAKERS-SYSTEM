/**
 * Project settings defaults — Pico Play Fun Makers KSA
 *
 * Approved by Ahmed Al-Dossary on 2026-04-10 (Pause #4).
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
 *
 * These defaults are applied to every new project at creation time.
 * Individual projects can override any setting via the project settings admin.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectSettingKey = keyof typeof PROJECT_SETTINGS_DEFAULTS;

export type ProjectSettingValue = string | number | boolean | string[] | null;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const PROJECT_SETTINGS_DEFAULTS = {
  // ---- Workflow toggles ----
  // On by default: this system is control-first.
  requireDocumentApprovalWorkflow: true,
  requireMaterialSubmittalWorkflow: true,
  requireShopDrawingWorkflow: true,
  requireProcurementWorkflow: true,

  // ---- Material tracking flags ----
  // PM + QA/QC review on by default: safer operationally.
  defaultRequiresPmReview: true,
  defaultRequiresQaqcReview: true,
  // Test certificates off by default: avoids noise. Toggle on per project/package/category.
  defaultRequiresTestCertificate: false,

  // ---- Document categories enabled ----
  // All categories available by default.
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
  notifyOnWorkflowStepAssignment: true,
  notifyOnWorkflowCompletion: true,
  // Document upload notifications off by default: avoids notification fatigue.
  notifyOnDocumentUpload: false,
  // Posting exception notifications on by default: operationally important.
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
