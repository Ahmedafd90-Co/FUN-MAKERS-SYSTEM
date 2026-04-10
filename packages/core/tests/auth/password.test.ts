import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/password';

describe('password', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('CorrectHorse9!Battery');
    expect(await verifyPassword('CorrectHorse9!Battery', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('CorrectHorse9!Battery');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces different hashes for the same password (salt)', async () => {
    const a = await hashPassword('x');
    const b = await hashPassword('x');
    expect(a).not.toEqual(b);
  });
});
