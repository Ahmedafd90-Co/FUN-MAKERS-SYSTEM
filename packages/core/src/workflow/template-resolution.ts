/**
 * Workflow template resolution — determines which template to use for a given
 * record type and project.
 *
 * Resolution order (first match wins):
 *   1. Project override  → project_settings key "workflow_template:{recordType}[:{subtype}]"
 *   2. Entity default    → entity.metadata_json.workflow_templates[recordType[:subtype]]
 *   3. System fallback   → first active template WHERE record_type = recordType [AND code LIKE '{subtype}_%']
 *
 * This implements the entity-defaults / project-overrides configuration model:
 *   - Entities define organizational defaults for all their projects
 *   - Projects can override to pick a different template variant
 *   - If neither is configured, the system picks deterministically (alphabetical)
 */

import { prisma } from '@fmksa/db';

// ---------------------------------------------------------------------------
// Resolution source — tells the operator why this template was selected
// ---------------------------------------------------------------------------

export type ResolutionSource = 'project_override' | 'entity_default' | 'system_default';

export type TemplateResolution = {
  code: string;
  source: ResolutionSource;
} | null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the workflow template code for a (recordType, projectId) pair.
 *
 * When `subtype` is provided (e.g. correspondence subtypes like 'letter',
 * 'claim'), resolution tries subtype-specific keys first at every tier,
 * then falls back to generic.  Callers that don't pass `subtype` get the
 * original behaviour unchanged.
 *
 * Returns null if no template is found at any level — callers should treat
 * this as "no workflow configured for this record type" (graceful skip).
 */
export async function resolveTemplateCode(
  recordType: string,
  projectId: string,
  subtype?: string,
): Promise<string | null> {
  const result = await resolveTemplate(recordType, projectId, subtype);
  return result?.code ?? null;
}

/**
 * Full resolution — returns both template code and the resolution source.
 * Used when the caller needs to store provenance (e.g. workflow instance creation).
 */
export async function resolveTemplate(
  recordType: string,
  projectId: string,
  subtype?: string,
): Promise<TemplateResolution> {
  const subtypeQualifier = subtype ? `${recordType}:${subtype}` : null;

  // 1. Project-level override — try subtype-specific first, then generic
  if (subtypeQualifier) {
    const specificKey = `workflow_template:${subtypeQualifier}`;
    const specificSetting = await prisma.projectSetting.findUnique({
      where: { projectId_key: { projectId, key: specificKey } },
    });
    if (specificSetting?.valueJson && typeof specificSetting.valueJson === 'string') {
      return { code: specificSetting.valueJson, source: 'project_override' };
    }
  }

  const settingKey = `workflow_template:${recordType}`;
  const projectSetting = await prisma.projectSetting.findUnique({
    where: { projectId_key: { projectId, key: settingKey } },
  });
  if (projectSetting?.valueJson && typeof projectSetting.valueJson === 'string') {
    return { code: projectSetting.valueJson, source: 'project_override' };
  }

  // 2. Entity-level default — try subtype-specific first, then generic
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { entityId: true },
  });
  if (project?.entityId) {
    const entity = await prisma.entity.findUnique({
      where: { id: project.entityId },
      select: { metadataJson: true },
    });
    if (entity?.metadataJson) {
      const meta = entity.metadataJson as Record<string, unknown>;
      const wfTemplates = meta.workflow_templates as Record<string, string> | undefined;
      if (subtypeQualifier && wfTemplates?.[subtypeQualifier]) {
        return { code: wfTemplates[subtypeQualifier], source: 'entity_default' };
      }
      if (wfTemplates?.[recordType]) {
        return { code: wfTemplates[recordType], source: 'entity_default' };
      }
    }
  }

  // 3. System fallback — for subtype records, prefer templates whose code starts
  //    with the subtype prefix (e.g. "letter_" for subtype "letter").
  if (subtype) {
    const subtypeFallback = await prisma.workflowTemplate.findFirst({
      where: { recordType, isActive: true, code: { startsWith: `${subtype}_` } },
      orderBy: { code: 'asc' },
      select: { code: true },
    });
    if (subtypeFallback) return { code: subtypeFallback.code, source: 'system_default' };
  }

  // Generic fallback — PIC-41 governance fix.
  //
  // Convention: the `*_standard` template for each record type is the safe
  // default. Higher-authority variants (e.g. `*_high_value` escalating to PD)
  // exist alongside and require explicit configuration to select.
  //
  // Before this fix, the fallback did `orderBy: { code: 'asc' }` and returned
  // the alphabetically-first match. For Expense/PO, `'h' < 's'` meant
  // `*_high_value` ALWAYS won, routing 100% of Expenses and POs to PD
  // approval by accident. The Finance and Contracts-Manager approval tiers
  // were dead code. The threshold-based escalation to PD authority was never
  // formally defined as policy — it just happened by alphabetical accident.
  // See PIC-41 for the governance finding.
  //
  // The conventional default `${recordType}_standard` is checked first. If
  // exact-prefix doesn't match, fall through to any `_standard`-suffixed
  // template for this recordType (covers the legacy `po_standard` /
  // recordType=`purchase_order` naming inconsistency without forcing a
  // seed-data rename). If neither, fall through to the original alphabetical-
  // first behaviour as a safety net for record types where no `_standard`
  // variant has been established yet.
  //
  // Record types that should escalate to a higher-authority variant per
  // amount (e.g. `*_high_value`) must configure the escalation via the
  // projectSetting mechanism at tier-1, not here. This generic fallback is
  // the safe, lowest-authority default — never the escalation path.
  const standardDefault = await prisma.workflowTemplate.findFirst({
    where: { recordType, isActive: true, code: `${recordType}_standard` },
    select: { code: true },
  });
  if (standardDefault) {
    return { code: standardDefault.code, source: 'system_default' };
  }

  const standardSuffix = await prisma.workflowTemplate.findFirst({
    where: { recordType, isActive: true, code: { endsWith: '_standard' } },
    orderBy: { code: 'asc' },
    select: { code: true },
  });
  if (standardSuffix) {
    return { code: standardSuffix.code, source: 'system_default' };
  }

  // Final fall-through for record types without ANY `*_standard` variant.
  // Still alphabetical-first; preserved to avoid breaking record types where
  // no standard convention has been established yet.
  const fallback = await prisma.workflowTemplate.findFirst({
    where: { recordType, isActive: true },
    orderBy: { code: 'asc' },
    select: { code: true },
  });

  return fallback ? { code: fallback.code, source: 'system_default' } : null;
}
