import bcrypt from 'bcryptjs';

const ROUNDS = 12;

/**
 * Hash a plaintext password with bcrypt (12 rounds).
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
