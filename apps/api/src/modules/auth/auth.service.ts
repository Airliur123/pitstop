import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthSession,
  AuthUser,
  MagicLinkRequestResult,
  MagicLinkVerificationResult,
} from '@pitstop/contracts';
import type { FastifyRequest } from 'fastify';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { AuthRepository } from './auth.repository';
import { AuthRateLimitService } from './auth-rate-limit.service';
import {
  AUTH_SESSION_COOKIE,
  generateOpaqueToken,
  hashOpaqueToken,
  readCookie,
} from './auth-security';
import { AUTH_MAILER, type AuthMailer } from './mailer.port';

const ephemeralTokenSecret = randomBytes(32).toString('base64url');
const ephemeralSessionSecret = randomBytes(32).toString('base64url');

@Injectable()
export class AuthService {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(AuthRateLimitService) private readonly rateLimit: AuthRateLimitService,
    @Inject(AUTH_MAILER) private readonly mailer: AuthMailer,
  ) {}

  async requestMagicLink(
    email: string,
    returnTo: string,
    ip: string,
  ): Promise<MagicLinkRequestResult> {
    await this.rateLimit.enforceMagicLinkRequest(ip, email);
    const rawToken = generateOpaqueToken();
    const tokenHash = this.hashLoginToken(rawToken);
    const expiresAt = new Date(Date.now() + this.environment.AUTH_MAGIC_LINK_TTL_SECONDS * 1_000);
    const creation = await this.repository.createLoginToken({
      email,
      expiresAt,
      returnTo,
      tokenHash,
    });
    const loginUrl = new URL(
      '/auth/verify',
      returnTo === '/admin' ? this.environment.ADMIN_BASE_URL : this.environment.WEB_BASE_URL,
    );
    loginUrl.searchParams.set('token', rawToken);
    try {
      await this.mailer.sendMagicLink({
        email,
        expiresInMinutes: Math.ceil(this.environment.AUTH_MAGIC_LINK_TTL_SECONDS / 60),
        loginUrl: loginUrl.toString(),
      });
    } catch {
      if (creation.deliverable) await this.repository.invalidateLoginToken(tokenHash);
      throw new ApiProblemException({
        status: 503,
        code: 'AUTH_EMAIL_UNAVAILABLE',
        title: 'Authentication email unavailable',
        detail: 'The sign-in email could not be sent. Please try again later.',
      });
    }
    return { accepted: true };
  }

  async verifyMagicLink(
    token: string,
    ip: string,
  ): Promise<{
    readonly rawSessionToken: string;
    readonly result: MagicLinkVerificationResult;
  }> {
    await this.rateLimit.enforceVerification(ip);
    const rawSessionToken = generateOpaqueToken();
    const verification = await this.repository.consumeLoginToken({
      tokenHash: this.hashLoginToken(token),
      sessionTokenHash: this.hashSessionToken(rawSessionToken),
      sessionExpiresAt: new Date(Date.now() + this.environment.AUTH_SESSION_TTL_SECONDS * 1_000),
    });
    if (verification.state === 'EXPIRED') {
      throw new ApiProblemException({
        status: 401,
        code: 'AUTH_TOKEN_EXPIRED',
        title: 'Sign-in link expired',
        detail: 'The sign-in link is invalid or has expired.',
      });
    }
    if (verification.state !== 'ACTIVE' || !verification.user || !verification.returnTo) {
      throw new ApiProblemException({
        status: 401,
        code: 'AUTH_TOKEN_INVALID',
        title: 'Invalid sign-in link',
        detail: 'The sign-in link is invalid or has expired.',
      });
    }
    return {
      rawSessionToken,
      result: {
        authenticated: true,
        returnTo: verification.returnTo,
        user: verification.user,
      },
    };
  }

  async currentSession(request: FastifyRequest): Promise<AuthSession> {
    const token = this.sessionToken(request);
    if (!token) return { authenticated: false };
    const user = await this.repository.findSession(this.hashSessionToken(token));
    return user ? { authenticated: true, user } : { authenticated: false };
  }

  async requireUser(request: FastifyRequest): Promise<AuthUser> {
    const session = await this.currentSession(request);
    if (session.authenticated) return session.user;
    const hasCookie = this.hasSessionCookie(request);
    throw new ApiProblemException({
      status: 401,
      code: hasCookie ? 'AUTH_SESSION_INVALID' : 'AUTH_REQUIRED',
      title: hasCookie ? 'Invalid authenticated session' : 'Authentication required',
      detail: hasCookie
        ? 'The authenticated session is invalid or has expired.'
        : 'A valid authenticated session is required.',
    });
  }

  async logout(request: FastifyRequest): Promise<void> {
    const token = this.sessionToken(request);
    if (token) await this.repository.revokeSession(this.hashSessionToken(token));
  }

  hasSessionCookie(request: FastifyRequest): boolean {
    return this.sessionToken(request) !== null;
  }

  private sessionToken(request: FastifyRequest): string | null {
    return readCookie(request.headers.cookie, AUTH_SESSION_COOKIE);
  }

  private hashLoginToken(token: string): string {
    return hashOpaqueToken(token, this.environment.AUTH_TOKEN_SECRET ?? ephemeralTokenSecret);
  }

  private hashSessionToken(token: string): string {
    return hashOpaqueToken(token, this.environment.AUTH_SESSION_SECRET ?? ephemeralSessionSecret);
  }
}
