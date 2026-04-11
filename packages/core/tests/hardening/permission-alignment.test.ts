/**
 * H8 hardening tests — permission alignment (H3 validation).
 *
 * Pure structural tests: no database required.
 * Validates that:
 *   1. All seeded procurement permission codes follow the resource.action pattern.
 *   2. The transition-action-to-permission mapping produces only seeded codes.
 *   3. Every resource with lifecycle transitions has the expected workflow perms.
 *   4. No duplicate permission codes exist in the seed.
 */
import { describe, it, expect } from 'vitest';
// Direct relative import — seed file isn't exported from @fmksa/db package.json
import { PROCUREMENT_PERMISSIONS } from '../../../db/src/seed/procurement-permissions';

// ---------------------------------------------------------------------------
// Replicate getTransitionPermission logic to test it in isolation.
// This mirrors apps/web/server/routers/procurement/_helpers.ts exactly.
// ---------------------------------------------------------------------------

const ACTION_TO_PERM_SUFFIX: Record<string, string> = {
  submit: 'submit',
  approve: 'approve',
  sign: 'sign',
  issue: 'issue',
  activate: 'activate',
  suspend: 'suspend',
  blacklist: 'blacklist',
  evaluate: 'evaluate',
  award: 'award',
  shortlist: 'shortlist',
  verify: 'verify',
  apply: 'apply',
  prepare_payment: 'prepare_payment',
  reject: 'review',
  return: 'review',
  review: 'review',
  receive_responses: 'review',
  terminate: 'terminate',
  supersede: 'terminate',
  expire: 'terminate',
  cancel: 'terminate',
  close: 'terminate',
};

function getTransitionPermission(resource: string, action: string): string {
  const suffix = ACTION_TO_PERM_SUFFIX[action];
  return suffix ? `${resource}.${suffix}` : `${resource}.edit`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const seededCodes = new Set(PROCUREMENT_PERMISSIONS.map((p) => p.code));

/**
 * Resources that use workflow transitions in their routers,
 * and the transition actions each supports.
 *
 * These must match the seeded permission actions exactly:
 *   - vendor: activate/suspend/blacklist (no linear workflow)
 *   - vendor_contract/framework_agreement: submit → review → approve → sign, terminate
 *   - rfq: submit → review → approve → issue, evaluate, award
 *   - quotation: review, shortlist, award, reject
 *
 * Note: reject/return map to .review via getTransitionPermission.
 * cancel/terminate map to .terminate (only seeded for vendor_contract/framework_agreement).
 */
const TRANSITIONED_RESOURCES = {
  vendor: ['activate', 'suspend', 'blacklist'],
  vendor_contract: ['submit', 'review', 'approve', 'sign', 'terminate', 'reject', 'return'],
  framework_agreement: ['submit', 'review', 'approve', 'sign', 'terminate', 'reject', 'return'],
  rfq: ['submit', 'review', 'approve', 'issue', 'evaluate', 'award', 'reject', 'return'],
  quotation: ['review', 'shortlist', 'award', 'reject'],
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('procurement permission seed integrity', () => {
  it('all codes follow resource.action pattern', () => {
    for (const perm of PROCUREMENT_PERMISSIONS) {
      expect(perm.code).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(perm.code).toBe(`${perm.resource}.${perm.action}`);
    }
  });

  it('no duplicate codes in seed', () => {
    const codes = PROCUREMENT_PERMISSIONS.map((p) => p.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('seed contains at least 60 permission codes', () => {
    // M3 generates: 13 resources × varying actions ≈ 60+ codes
    expect(PROCUREMENT_PERMISSIONS.length).toBeGreaterThanOrEqual(60);
  });

  it('every resource has a view action', () => {
    const resources = [...new Set(PROCUREMENT_PERMISSIONS.map((p) => p.resource))];
    for (const resource of resources) {
      expect(seededCodes.has(`${resource}.view`)).toBe(true);
    }
  });
});

describe('getTransitionPermission mapping', () => {
  it('maps every known transition action for transitioned resources to a seeded code', () => {
    const missing: string[] = [];
    for (const [resource, actions] of Object.entries(TRANSITIONED_RESOURCES)) {
      for (const action of actions) {
        const code = getTransitionPermission(resource, action);
        if (!seededCodes.has(code)) {
          missing.push(`${resource} / ${action} → ${code}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('falls back to .edit for unknown actions', () => {
    expect(getTransitionPermission('vendor', 'unknown_action')).toBe('vendor.edit');
    expect(getTransitionPermission('rfq', 'some_new_action')).toBe('rfq.edit');
  });

  it('maps reject/return/receive_responses to .review', () => {
    expect(getTransitionPermission('rfq', 'reject')).toBe('rfq.review');
    expect(getTransitionPermission('rfq', 'return')).toBe('rfq.review');
    expect(getTransitionPermission('rfq', 'receive_responses')).toBe('rfq.review');
  });

  it('maps terminate/supersede/expire/cancel/close to .terminate', () => {
    expect(getTransitionPermission('vendor_contract', 'terminate')).toBe('vendor_contract.terminate');
    expect(getTransitionPermission('vendor_contract', 'supersede')).toBe('vendor_contract.terminate');
    expect(getTransitionPermission('vendor_contract', 'expire')).toBe('vendor_contract.terminate');
    expect(getTransitionPermission('vendor_contract', 'cancel')).toBe('vendor_contract.terminate');
    expect(getTransitionPermission('vendor_contract', 'close')).toBe('vendor_contract.terminate');
  });

  it('maps direct lifecycle actions to their own suffix', () => {
    expect(getTransitionPermission('rfq', 'submit')).toBe('rfq.submit');
    expect(getTransitionPermission('rfq', 'approve')).toBe('rfq.approve');
    expect(getTransitionPermission('rfq', 'issue')).toBe('rfq.issue');
    expect(getTransitionPermission('rfq', 'evaluate')).toBe('rfq.evaluate');
    expect(getTransitionPermission('rfq', 'award')).toBe('rfq.award');
  });
});

describe('router permission coverage', () => {
  it('all transitioned resources have seeded view + create + edit + delete', () => {
    const crudActions = ['view', 'create', 'edit', 'delete'];
    const missing: string[] = [];

    for (const resource of Object.keys(TRANSITIONED_RESOURCES)) {
      for (const action of crudActions) {
        const code = `${resource}.${action}`;
        if (!seededCodes.has(code)) {
          missing.push(code);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('entity-scoped master data resources have manage permissions', () => {
    // Category, catalog, project_vendor use .manage instead of individual CUD
    expect(seededCodes.has('procurement_category.manage')).toBe(true);
    expect(seededCodes.has('item_catalog.manage')).toBe(true);
    expect(seededCodes.has('project_vendor.manage')).toBe(true);
  });
});
