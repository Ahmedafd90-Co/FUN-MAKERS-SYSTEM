import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authService, InvalidCredentialsError, AccountLockedError } from '@fmksa/core';

/**
 * Auth.js v5 configuration for the Fun Makers KSA platform.
 *
 * Strategy: JWT (no adapter) — the JWT carries user identity; the
 * `user_sessions` table is an audit artifact, not a session store.
 *
 * Provider: Credentials (email + password), delegating to
 * `@fmksa/core/auth` for password verification, lockout, and audit.
 *
 * MFA and SSO provider slots are reserved for future modules but not
 * wired in Module 1.
 */

// Fail fast if AUTH_SECRET is missing in production
if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) {
  throw new Error(
    'AUTH_SECRET environment variable is required in production. ' +
      'Generate one with: npx auth secret',
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Session strategy: JWT — simpler for tRPC context, no DB lookup per request
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },

  pages: {
    signIn: '/sign-in',
    error: '/sign-in',
  },

  providers: [
    Credentials({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        try {
          // Delegate to core auth service (handles lockout, audit, etc.)
          const result = await authService.signIn(
            email,
            password,
            '0.0.0.0', // IP resolved at tRPC layer, not here
            'next-auth', // UA resolved at tRPC layer, not here
          );

          // Return the user object for the JWT
          return {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
          };
        } catch (error) {
          if (
            error instanceof InvalidCredentialsError ||
            error instanceof AccountLockedError
          ) {
            return null;
          }
          throw error;
        }
      },
    }),
  ],

  callbacks: {
    /**
     * JWT callback — enrich the token with user data on sign-in.
     */
    async jwt({ token, user }) {
      // `user` is only present on initial sign-in
      if (user) {
        token.userId = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },

    /**
     * Session callback — expose user data to the client session.
     */
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.userId as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },

  // Trust the AUTH_SECRET env var (or auto-generated in dev)
  secret: process.env.AUTH_SECRET,
});
