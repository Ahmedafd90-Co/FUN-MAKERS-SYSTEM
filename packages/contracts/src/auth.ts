/**
 * Auth contract schemas — shared between client and server.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const SignInSchema = z.object({
  email: z.string().email('Invalid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

export type SignInInput = z.infer<typeof SignInSchema>;

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

export const AuthRoleSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  status: z.string(),
  roles: z.array(AuthRoleSchema),
  permissions: z.array(z.string()),
});

export type AuthUserOutput = z.infer<typeof AuthUserSchema>;

export const SignInResultSchema = z.object({
  success: z.literal(true),
});

export const SignOutResultSchema = z.object({
  success: z.literal(true),
});

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const AuthErrorCode = {
  INVALID_CREDENTIALS: 'invalid_credentials',
  ACCOUNT_LOCKED: 'account_locked',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];
