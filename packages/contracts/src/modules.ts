/**
 * PIC-98 PR-2 (F4) — Module entitlement registry.
 *
 * The sellable-modules gate per PD ruling 71de0038:
 *   - MODULES maps each sellable module to its permission-resource prefixes
 *     (the `<resource>.<action>` part before the dot, e.g. `ipa.view` ∈
 *     `commercial`).
 *   - `Organization.enabledModules` (schema column added in PR-2) is the
 *     tenant-level set of sellable modules they've licensed.
 *   - PLATFORM_ALWAYS_ON_RESOURCES are NEVER gated — they're platform
 *     plumbing every tenant must always have access to (subject to RBAC).
 *
 * The seam is single-point: filter applied at `getPermissionCodes` in
 * @fmksa/core access-control (PR-2 Step 6). RolePermission rows are NEVER
 * mutated — per-USER RBAC and per-TENANT entitlement stay orthogonal
 * (PA1.C ruling).
 *
 * **Architecture invariants** (from PIC-98 ticket + recon):
 * 1. Entitlement is a FILTER on top of RBAC, not a mutation of RBAC.
 * 2. Platform permissions are ALWAYS on (never gated by a module).
 * 3. Sellable modules can be turned on/off per-tenant by platform-admin
 *    (the master-provisioning procedure lands in PR-4).
 * 4. The registry is the SINGLE source of truth — both the chokepoint
 *    filter (server) and any future UI module-picker (PR-4+) read from
 *    this file. Adding a new permission resource requires deciding which
 *    module it belongs to (or whether it's platform-always-on) and
 *    listing it here.
 *
 * **Modules recon (per PIC-98 ticket + PA1.C):**
 *   - commercial    — Revenue side: IPA/IPC/Variation/CostProposal/
 *                     TaxInvoice/Correspondence/InvoiceCollection
 *   - procurement   — RFQ/PurchaseOrder/VendorContract/FrameworkAgreement/
 *                     SupplierInvoice/CreditNote/Vendor/ItemCatalog
 *   - budget        — Cost-control: budget management + expenses
 *                     (SELLABLE per PD a0748f23 — distinct from platform
 *                     plumbing `posting`/`reconciliation` which are
 *                     always-on)
 *   - documents     — Document library + signatures
 *   - drawings      — Shop drawings, design submittals
 *   - layer1        — Layer 1 / ProjectLedger: intercompany contracts,
 *                     prime contracts, project participants, entity
 *                     legal details
 */

/** All sellable modules — tenants may have any subset enabled. */
export const MODULES = {
  commercial: [
    'ipa',
    'ipc',
    'variation',
    'cost_proposal',
    'tax_invoice',
    'correspondence',
    'invoice_collection',
    'commercial_dashboard',
  ],
  procurement: [
    'rfq',
    'purchase_order',
    'vendor_contract',
    'framework_agreement',
    'supplier_invoice',
    'credit_note',
    'vendor',
    'item_catalog',
  ],
  budget: ['budget', 'expense'],
  documents: ['document'],
  drawings: ['drawing'],
  layer1: [
    'intercompany_contract',
    'prime_contract',
    'project_participant',
    'entity_legal_details',
  ],
} as const;

export type ModuleKey = keyof typeof MODULES;

/** All ModuleKey values as a runtime array (for validation / UI iteration). */
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

/**
 * Platform-always-on permission resources — NEVER filtered by entitlement.
 *
 * Per PD ruling a0748f23, the AUTHORITATIVE platform-vs-sellable line
 * starts with: `system / posting / audit / reconciliation / user / role /
 * project_settings`. The platform-always-on set ALSO covers every
 * non-sellable backbone/admin resource present in the seed today so the
 * closed-set entitlement filter doesn't blackhole legitimately-granted
 * tenant perms (cross_project.read, override.execute, project.create,
 * workflow template CRUD, etc. — perms that ARE tenant-grantable but
 * DO NOT belong to a sellable module).
 *
 * Categories below:
 *   - PD core (system/posting/audit/reconciliation/user/role/
 *     project_settings) — the seven called out explicitly in a0748f23
 *   - Backbone (entity/project) — every tenant has Org → Entity → Project;
 *     these aren't a sellable feature, they're the spine
 *   - Tenant-grantable admin (cross_project/override) — PMO-style grants
 *     and override mechanisms
 *   - Platform-admin CRUD (workflow/notification/reference_data) — per
 *     PR-1 PD ruling these stay platform-admin-only (PR-3a will block
 *     tenant_admin via the role itself, not via this filter)
 *   - UI/internal (screen/import) — UI gating + admin/feature plumbing
 *
 * When a NEW resource is added to the permission seed catalog, the
 * contributor MUST decide (and the entitlement test will FAIL until they
 * do): does it belong to a sellable module (add to MODULES) OR is it
 * platform plumbing (add here)?
 */
export const PLATFORM_ALWAYS_ON_RESOURCES = [
  // PD's core list (ruling a0748f23)
  'system',
  'posting',
  'audit',
  'reconciliation',
  'user',
  'role',
  'project_settings',
  // Backbone — Org → Entity → Project; every tenant has these
  'entity',
  'project',
  // Tenant-grantable admin (PMO-style + override mechanism)
  'cross_project',
  'override',
  // Platform-admin CRUD (workflow templates, notification templates,
  // reference data) — per PR-1 disposition table these stay admin-only;
  // tenant_admin is blocked at the role level (PR-3a) not by this filter
  'workflow',
  'notification',
  'reference_data',
  // UI/internal gating + admin/feature plumbing
  'screen',
  'import',
] as const;

/** Build the reverse index from resource prefix → sellable module key. */
const RESOURCE_TO_MODULE: ReadonlyMap<string, ModuleKey> = (() => {
  const map = new Map<string, ModuleKey>();
  for (const [moduleKey, resources] of Object.entries(MODULES) as Array<
    [ModuleKey, readonly string[]]
  >) {
    for (const resource of resources) {
      map.set(resource, moduleKey);
    }
  }
  return map;
})();

const PLATFORM_RESOURCE_SET: ReadonlySet<string> = new Set(
  PLATFORM_ALWAYS_ON_RESOURCES,
);

/**
 * Returns true if a permission code is platform-always-on
 * (never filtered by enabled-modules).
 *
 * Convention: permission codes are `<resource>.<action>` (e.g. `posting.view`).
 * Hyphenated/dotted resources are NOT split — the resource is the substring
 * before the FIRST dot.
 */
export function isPlatformAlwaysOnPermission(permissionCode: string): boolean {
  const dot = permissionCode.indexOf('.');
  const resource = dot === -1 ? permissionCode : permissionCode.slice(0, dot);
  return PLATFORM_RESOURCE_SET.has(resource);
}

/**
 * Returns the sellable ModuleKey that owns a permission code, or `null`
 * if it's platform-always-on or unknown to the registry.
 *
 * Unknown permissions (resources NOT in MODULES and NOT in
 * PLATFORM_ALWAYS_ON_RESOURCES) return `null` — the chokepoint filter
 * treats `null` as "block by default" (closed-set entitlement; an
 * unregistered resource is not entitled to anyone via this seam).
 */
export function moduleForPermission(
  permissionCode: string,
): ModuleKey | null {
  if (isPlatformAlwaysOnPermission(permissionCode)) return null;
  const dot = permissionCode.indexOf('.');
  const resource = dot === -1 ? permissionCode : permissionCode.slice(0, dot);
  return RESOURCE_TO_MODULE.get(resource) ?? null;
}

/**
 * Filter a list of permission codes through a tenant's enabled-modules set.
 *
 * Rules:
 *   - Platform-always-on permissions PASS unchanged.
 *   - Sellable-module permissions PASS only if the module is in
 *     `enabledModules`.
 *   - Unknown permissions (not in registry, not platform) are FILTERED OUT
 *     by default (closed-set entitlement — a new permission resource MUST
 *     be registered in MODULES or PLATFORM_ALWAYS_ON_RESOURCES to be
 *     grantable).
 *
 * This is the core entitlement contract — used by `getPermissionCodes`
 * (PR-2 Step 6) at the @fmksa/core chokepoint. Stays pure (no DB access)
 * so it's testable in isolation.
 */
export function filterPermissionsByEntitlement(
  permissionCodes: readonly string[],
  enabledModules: readonly ModuleKey[],
): string[] {
  const enabled = new Set<ModuleKey>(enabledModules);
  return permissionCodes.filter((code) => {
    if (isPlatformAlwaysOnPermission(code)) return true;
    const moduleKey = moduleForPermission(code);
    return moduleKey !== null && enabled.has(moduleKey);
  });
}
