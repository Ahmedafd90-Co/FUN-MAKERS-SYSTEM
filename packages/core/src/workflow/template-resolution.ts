/**
 * Workflow template resolution — determines which template to use for a given
 * record type and project.
 *
 * Resolution order (first match wins):
 *   1. Project override  → project_settings key "workflow_template:{recordType}[:{subtype}]"
 *   2. Entity default    → entity.metadata_json.workflow_templates[recordType[:subtype]]
 *   3. Amount-triggered escalation (PIC-41) → project_settings key
 *      "workflow_template_high_value_threshold:{recordType}" — when set and
 *      caller-provided amount exceeds it, escalate to "{prefix}_high_value"
 *      (where prefix comes from WORKFLOW_TEMPLATE_REGISTRY; falls through to
 *      tier-4 standard if no high_value variant exists, or recordType is
 *      subtype-driven, or recordType is not in the registry)
 *   4. System fallback   →
 *        - For subtype calls: any "{subtype}_*" template (unchanged).
 *        - For registered standard-default recordTypes: "{prefix}_standard".
 *        - For registered subtype-driven recordTypes WITHOUT subtype: returns
 *          null (refuses to silently fall through to an alphabetical accident).
 *        - For un-registered recordTypes: alphabetical-first match (legacy
 *          escape hatch for non-workflow-managed templates like
 *          `document_approval_v1`; honest-limits per PIC-49).
 *
 * This implements the entity-defaults / project-overrides configuration model:
 *   - Entities define organizational defaults for all their projects
 *   - Projects can override to pick a different template variant
 *   - Projects can configure an amount threshold to auto-escalate to high-value
 *   - If neither is configured, the system defaults to the *_standard variant
 *     (the safe, lowest-authority tier — NEVER *_high_value by default)
 *
 * PIC-50 — Canonical recordType→template-code mapping
 * ----------------------------------------------------
 *
 * Tier-3 (PIC-41 amount escalation) and tier-4 (generic fallback) previously
 * used string `endsWith: '_high_value'` / `endsWith: '_standard'` heuristics.
 * Those were policy-by-accident — they returned whichever template
 * alphabetically won per recordType, which works today only because no two
 * registered templates per recordType end in the same suffix. One additional
 * template per recordType would silently break it (same shape as PIC-41's
 * "alphabetical-first routed 100% of Expenses/POs to PD approval").
 *
 * Replaced with explicit lookups against `WORKFLOW_TEMPLATE_REGISTRY`
 * (declared in `@fmksa/contracts`). The registry's `prefix` is the source
 * of truth for the template-code prefix per recordType. Both `endsWith`
 * heuristics are deleted.
 *
 * Convention for adding a new workflow-managed recordType — see the
 * docstring on `WORKFLOW_TEMPLATE_REGISTRY` in `@fmksa/contracts`. The
 * parity-guard test at
 * `packages/core/tests/workflow/template-registry-parity.test.ts` fails
 * loudly if (a) a new entity is added to WORKFLOW_DRIVEN_MODELS without
 * a registry entry, (b) a registry entry is added without a seed
 * template, or (c) a subtype-driven recordType is resolved without
 * subtype.
 *
 * Honest-limits (per PIC-49 discipline)
 * --------------------------------------
 *
 * The final alphabetical fallback (the very last block in this file)
 * survives for record types NOT in the registry — specifically the
 * `document` recordType used by `document_approval_v1`, which is not
 * workflow-managed (not in WORKFLOW_DRIVEN_MODELS). This escape hatch
 * preserves behaviour for those callers without granting alphabetical
 * fallback to workflow-managed entities (those go through the registry
 * tier above and return null on miss rather than alphabetical).
 */

import { prisma, Prisma } from '@fmksa/db';
import { WORKFLOW_TEMPLATE_REGISTRY } from '@fmksa/contracts';

// ---------------------------------------------------------------------------
// Resolution source — tells the operator why this template was selected
// ---------------------------------------------------------------------------

export type ResolutionSource = 'project_override' | 'entity_default' | 'system_default';

export type TemplateResolution = {
  code: string;
  source: ResolutionSource;
} | null;

// ---------------------------------------------------------------------------
// Registry lookup helper — narrows the type from the broad registry
// ---------------------------------------------------------------------------

type RegistryEntry =
  | { mode: 'standard-default'; prefix: string }
  | { mode: 'subtype-driven' };

function registryEntryFor(recordType: string): RegistryEntry | undefined {
  // `as Record<...>` because the const-satisfies-Record literal type from
  // contracts is precisely-keyed; we accept any string at the boundary and
  // return undefined for non-registered recordTypes.
  const registry = WORKFLOW_TEMPLATE_REGISTRY as Record<string, RegistryEntry>;
  return registry[recordType];
}

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
  amount?: Prisma.Decimal | string | number,
): Promise<string | null> {
  const result = await resolveTemplate(recordType, projectId, subtype, amount);
  return result?.code ?? null;
}

/**
 * Full resolution — returns both template code and the resolution source.
 * Used when the caller needs to store provenance (e.g. workflow instance creation).
 *
 * `amount` (PIC-41): when provided AND the project has configured a tier
 * threshold via projectSetting key `workflow_template_high_value_threshold:
 * {recordType}`, the resolver checks whether amount exceeds the threshold and
 * if so returns the `{prefix}_high_value` variant (where prefix comes from
 * WORKFLOW_TEMPLATE_REGISTRY). Unconfigured threshold OR amount within
 * threshold → falls through to the standard default. The threshold value
 * itself is not hardcoded anywhere; it is a per-project setting that the PD
 * configures explicitly per Pico Play's DoA matrix.
 */
export async function resolveTemplate(
  recordType: string,
  projectId: string,
  subtype?: string,
  amount?: Prisma.Decimal | string | number,
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

  // ---------------------------------------------------------------------------
  // From here down — PIC-50 canonical mechanism replaces PIC-41's `endsWith`
  // heuristics. Look up the registry once; reuse for tier-3 and tier-4.
  // ---------------------------------------------------------------------------
  const registryEntry = registryEntryFor(recordType);

  // 3. Amount-triggered escalation (PIC-41) — canonical mechanism (PIC-50).
  //
  // When the caller passes an `amount` AND the project has configured a
  // tier threshold via `projectSetting` key
  // `workflow_template_high_value_threshold:{recordType}` (value: SAR amount
  // as a decimal string), check whether amount exceeds the threshold and
  // route to `{prefix}_high_value` if so.
  //
  // Decimal comparison via Prisma.Decimal — no JS float math. The threshold
  // value is operator-set per-project (the PD writes Pico Play's DoA matrix
  // explicitly per project); this resolver only READS it. No threshold value
  // is hardcoded in code, seed, or test-as-policy anywhere.
  //
  // Unconfigured threshold OR amount within threshold OR no `{prefix}_high_value`
  // variant exists → falls through to standard-default. This is the safe
  // direction: misconfigured threshold defaults to LOWER authority (Finance /
  // Contracts Manager), never escalates to PD by accident.
  //
  // Subtype-driven recordTypes (correspondence) and un-registered recordTypes
  // skip this tier entirely — they don't have a single `{prefix}_high_value`
  // to escalate to. Subtype-driven amount escalation, if ever needed, would
  // be implemented per-subtype via projectSetting override (tier-1), not via
  // this generic mechanism.
  if (amount !== undefined && registryEntry?.mode === 'standard-default') {
    const thresholdKey = `workflow_template_high_value_threshold:${recordType}`;
    const thresholdSetting = await prisma.projectSetting.findUnique({
      where: { projectId_key: { projectId, key: thresholdKey } },
    });
    if (thresholdSetting?.valueJson && typeof thresholdSetting.valueJson === 'string') {
      // Decimal-safe comparison. Both threshold and amount may arrive as
      // strings (Prisma Decimal serializes to string), numbers, or Decimal.
      try {
        const threshold = new Prisma.Decimal(thresholdSetting.valueJson);
        const amountDec = new Prisma.Decimal(amount.toString());
        if (amountDec.greaterThan(threshold)) {
          const highValue = await prisma.workflowTemplate.findFirst({
            where: { recordType, isActive: true, code: `${registryEntry.prefix}_high_value` },
            select: { code: true },
          });
          if (highValue) {
            return { code: highValue.code, source: 'system_default' };
          }
          // No `{prefix}_high_value` variant exists; fall through to standard.
        }
      } catch {
        // Malformed threshold value (not a valid decimal string). Fall through
        // to standard. The operator should fix the projectSetting; meanwhile
        // safe default applies. Intentionally silent — the alternative is
        // throwing during entity create, which is worse than safe-default.
      }
    }
  }

  // 4. System fallback — for subtype records, prefer templates whose code starts
  //    with the subtype prefix (e.g. "letter_" for subtype "letter").
  if (subtype) {
    const subtypeFallback = await prisma.workflowTemplate.findFirst({
      where: { recordType, isActive: true, code: { startsWith: `${subtype}_` } },
      orderBy: { code: 'asc' },
      select: { code: true },
    });
    if (subtypeFallback) return { code: subtypeFallback.code, source: 'system_default' };
  }

  // Generic fallback — PIC-50 canonical mechanism.
  //
  // Look up the recordType in the registry. Three cases:
  //
  //   a. `standard-default` mode — find `{prefix}_standard`. The prefix is
  //      explicit (e.g. `po` for `purchase_order`); no string-`endsWith`
  //      heuristic. If the template doesn't exist in seed, return null —
  //      the parity-guard test would have caught this in CI.
  //
  //   b. `subtype-driven` mode — the recordType has no canonical
  //      `{prefix}_standard`. The tier-4 subtype branch above already
  //      handled callers that passed a subtype; if we're here, the caller
  //      did NOT pass subtype. Return null rather than silently falling
  //      through to an alphabetical accident. (This is the latent
  //      financial-control mis-routing the recon found — a no-subtype
  //      `correspondence` resolve would have returned `back_charge_standard`
  //      via the old `endsWith` heuristic. PIC-50 closes it.)
  //
  //   c. Not in registry — the recordType is not workflow-managed (e.g.
  //      `document` for `document_approval_v1`). Fall through to the
  //      legacy alphabetical-first fallback below as an honest-limits
  //      escape hatch. The workflow-integrity apparatus does NOT cover
  //      non-registered recordTypes; this preserves behaviour for them
  //      without granting the alphabetical fallback to workflow-managed
  //      entities (those return null above and never reach this).
  if (registryEntry) {
    if (registryEntry.mode === 'standard-default') {
      const standardDefault = await prisma.workflowTemplate.findFirst({
        where: { recordType, isActive: true, code: `${registryEntry.prefix}_standard` },
        select: { code: true },
      });
      return standardDefault
        ? { code: standardDefault.code, source: 'system_default' }
        : null;
    }
    // subtype-driven without subtype — already exhausted above; return null
    // rather than fall through to alphabetical.
    return null;
  }

  // Final fall-through for record types NOT in WORKFLOW_TEMPLATE_REGISTRY.
  //
  // Honest-limits (PIC-49 discipline): this alphabetical-first match is the
  // legacy behaviour preserved for non-workflow-managed recordTypes like
  // `document` (used by the `document_approval_v1` template). It does NOT
  // protect workflow-managed entities — those are required to be in the
  // registry and resolve through it above. If a workflow-managed entity ever
  // reaches this line, that's drift the parity guard should have caught
  // (WORKFLOW_DRIVEN_MODELS contains it but WORKFLOW_TEMPLATE_REGISTRY doesn't).
  const fallback = await prisma.workflowTemplate.findFirst({
    where: { recordType, isActive: true },
    orderBy: { code: 'asc' },
    select: { code: true },
  });

  return fallback ? { code: fallback.code, source: 'system_default' } : null;
}
