/**
 * Layer 1 transition action → permission code mapping.
 *
 * Used by Layer 1 routers to enforce per-action permissions on transition
 * endpoints. Single source of truth — routers MUST go through
 * `getLayer1ActionPermission` rather than hard-coding strings.
 *
 * Differs from procurement's permission-map.ts: Layer 1 uses direct 1:1
 * mappings (sign → sign, cancel → cancel) rather than the role-intent
 * collapsing procurement applies (cancel → terminate). Layer 1 state machines
 * are smaller and the verbs are operationally distinct (a cancelled prime
 * contract is not a terminated one — different audit semantics).
 */

/**
 * Per-resource action → permission suffix maps.
 * Each entry maps a transition action verb to the seeded permission suffix
 * for that resource. Resource is part of the key to prevent cross-resource
 * leakage (e.g., intercompany has `close`, prime contract does not).
 */
const LAYER1_ACTION_TO_PERM_SUFFIX: Record<string, Record<string, string>> = {
  prime_contract: {
    sign: 'sign',
    activate: 'activate',
    complete: 'complete',
    terminate: 'terminate',
    cancel: 'cancel',
  },
  intercompany_contract: {
    sign: 'sign',
    activate: 'activate',
    close: 'close',
    cancel: 'cancel',
  },
};

/**
 * Resolves the required permission code for a Layer 1 transition action.
 * Returns `{resource}.{permSuffix}` if the action is valid for the resource.
 *
 * Throws if the action is not in the map. Defense-in-depth: routers already
 * gate the action verb via `z.enum([...])`, so an unmapped action reaching
 * here means either (a) a new action was added to the enum without updating
 * this map, or (b) the function was called from somewhere that bypassed the
 * enum. Either way, fail closed rather than silently downgrading to `edit`,
 * which would let an unmapped action pass any caller holding `edit` rights.
 */
export function getLayer1ActionPermission(
  resource: 'prime_contract' | 'intercompany_contract',
  action: string,
): string {
  const suffix = LAYER1_ACTION_TO_PERM_SUFFIX[resource]?.[action];
  if (!suffix) {
    throw new Error(
      `Unknown action '${action}' for resource '${resource}' in Layer 1 permission map. Add it to LAYER1_ACTION_TO_PERM_SUFFIX or fix the action verb.`,
    );
  }
  return `${resource}.${suffix}`;
}
