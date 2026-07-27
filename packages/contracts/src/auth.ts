export const authRoleValues = ['USER', 'ADMIN'] as const;
export type AuthRole = (typeof authRoleValues)[number];

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly role: AuthRole;
}

export interface AuthenticatedSession {
  readonly authenticated: true;
  readonly user: AuthUser;
}

export interface UnauthenticatedSession {
  readonly authenticated: false;
}

export type AuthSession = AuthenticatedSession | UnauthenticatedSession;

export interface MagicLinkRequestResult {
  readonly accepted: true;
}

export interface MagicLinkVerificationResult extends AuthenticatedSession {
  readonly returnTo: string;
}

export type LogoutResult = UnauthenticatedSession;
