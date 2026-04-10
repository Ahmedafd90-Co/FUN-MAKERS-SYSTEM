/**
 * Auth service — public API for authentication operations.
 *
 * This re-exports `sessionService` under the canonical `authService` name
 * that downstream consumers (Auth.js config, tRPC procedures) expect.
 */
import { sessionService } from './session';

export const authService = {
  signIn: sessionService.signIn,
  recordLogout: sessionService.recordLogout,
  getUser: sessionService.getUser,
};
