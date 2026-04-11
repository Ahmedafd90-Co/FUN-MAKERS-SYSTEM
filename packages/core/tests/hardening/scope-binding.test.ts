/**
 * H8 hardening tests — scope-binding assertions (H1 validation).
 *
 * Pure unit tests: no database required.
 * Validates that assertProjectScope / assertEntityScope correctly
 * block cross-scope access attempts.
 */
import { describe, it, expect } from 'vitest';
import {
  ScopeMismatchError,
  assertProjectScope,
  assertEntityScope,
} from '../../src/scope-binding';

// ---------------------------------------------------------------------------
// assertProjectScope
// ---------------------------------------------------------------------------

describe('assertProjectScope', () => {
  it('does not throw when projectId matches', () => {
    const record = { projectId: 'proj-aaa' };
    expect(() =>
      assertProjectScope(record, 'proj-aaa', 'VendorContract', 'vc-1'),
    ).not.toThrow();
  });

  it('throws ScopeMismatchError when projectId does not match', () => {
    const record = { projectId: 'proj-aaa' };
    expect(() =>
      assertProjectScope(record, 'proj-bbb', 'VendorContract', 'vc-1'),
    ).toThrow(ScopeMismatchError);
  });

  it('error message includes record type and ID', () => {
    const record = { projectId: 'proj-aaa' };
    try {
      assertProjectScope(record, 'proj-bbb', 'RFQ', 'rfq-42');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ScopeMismatchError);
      expect((err as Error).message).toContain('RFQ');
      expect((err as Error).message).toContain('rfq-42');
      expect((err as Error).message).toContain('project');
    }
  });

  it('treats empty strings as valid (but mismatched)', () => {
    const record = { projectId: '' };
    expect(() =>
      assertProjectScope(record, 'proj-aaa', 'Test', 'id-1'),
    ).toThrow(ScopeMismatchError);
  });
});

// ---------------------------------------------------------------------------
// assertEntityScope
// ---------------------------------------------------------------------------

describe('assertEntityScope', () => {
  it('does not throw when entityId matches', () => {
    const record = { entityId: 'ent-aaa' };
    expect(() =>
      assertEntityScope(record, 'ent-aaa', 'Vendor', 'v-1'),
    ).not.toThrow();
  });

  it('throws ScopeMismatchError when entityId does not match', () => {
    const record = { entityId: 'ent-aaa' };
    expect(() =>
      assertEntityScope(record, 'ent-bbb', 'Vendor', 'v-1'),
    ).toThrow(ScopeMismatchError);
  });

  it('error message includes record type and ID', () => {
    const record = { entityId: 'ent-aaa' };
    try {
      assertEntityScope(record, 'ent-bbb', 'Category', 'cat-7');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ScopeMismatchError);
      expect((err as Error).message).toContain('Category');
      expect((err as Error).message).toContain('cat-7');
      expect((err as Error).message).toContain('entity');
    }
  });
});

// ---------------------------------------------------------------------------
// ScopeMismatchError identity
// ---------------------------------------------------------------------------

describe('ScopeMismatchError', () => {
  it('has the correct name property', () => {
    const err = new ScopeMismatchError('Vendor', 'v-1', 'entity');
    expect(err.name).toBe('ScopeMismatchError');
  });

  it('is instanceof Error', () => {
    const err = new ScopeMismatchError('RFQ', 'rfq-1', 'project');
    expect(err).toBeInstanceOf(Error);
  });
});
