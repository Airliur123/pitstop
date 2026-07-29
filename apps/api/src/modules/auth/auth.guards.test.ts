import type { ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@pitstop/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { ApiEnvironmentProvider } from '../../configuration';
import { CurrentUser, RoleGuard, SessionAuthGuard, SessionCsrfGuard } from './auth.guards';
import type { AuthService } from './auth.service';

function httpContext(request: Record<PropertyKey, unknown>): ExecutionContext {
  class TestController {
    readonly marker = true;
  }
  return {
    getClass: () => TestController,
    getHandler: () => function handler() {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('authentication guards', () => {
  it('attaches the authenticated user for downstream role checks', async () => {
    const user: AuthUser = { email: 'us***@example.test', id: 'user-id', role: 'USER' };
    const auth = { requireUser: vi.fn().mockResolvedValue(user) } as unknown as AuthService;
    const request = { headers: {} };
    const guard = new SessionAuthGuard(auth);
    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true);
    expect(auth.requireUser).toHaveBeenCalledWith(request);
    expect(CurrentUser).toBeDefined();
  });

  it('rejects a protected role when no matching authenticated user is attached', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['ADMIN']),
    };
    const guard = new RoleGuard(reflector as never);
    expect(() => guard.canActivate(httpContext({ headers: {} }))).toThrowError(
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it('accepts same-origin mutations and rejects absent or foreign origins', () => {
    const guard = new SessionCsrfGuard({
      ADMIN_BASE_URL: 'http://localhost:3001',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      WEB_BASE_URL: 'http://localhost:3000',
    } as ApiEnvironmentProvider);
    expect(guard.canActivate(httpContext({ headers: { origin: 'http://localhost:3000' } }))).toBe(
      true,
    );
    expect(guard.canActivate(httpContext({ headers: { origin: 'http://localhost:3001' } }))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(httpContext({ headers: { origin: 'https://attacker.example' } })),
    ).toThrowError();
    expect(() => guard.canActivate(httpContext({ headers: {} }))).toThrowError();
  });
});
