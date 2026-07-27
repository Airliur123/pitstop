import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthRole, AuthUser } from '@pitstop/contracts';
import type { FastifyRequest } from 'fastify';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { AuthService } from './auth.service';

const AUTH_USER = Symbol('AUTH_USER');
const AUTH_ROLES = Symbol('AUTH_ROLES');

export const RequireRoles = (...roles: readonly AuthRole[]) => SetMetadata(AUTH_ROLES, roles);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<FastifyRequest>();
  return Reflect.get(request, AUTH_USER) as AuthUser | undefined;
});

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const user = await this.auth.requireUser(request);
    Reflect.set(request, AUTH_USER, user);
    return true;
  }
}

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<readonly AuthRole[]>(AUTH_ROLES, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const user = Reflect.get(request, AUTH_USER) as AuthUser | undefined;
    if (user && required.includes(user.role)) return true;
    throw new ApiProblemException({
      status: 403,
      code: 'AUTH_ROLE_REQUIRED',
      title: 'Insufficient permission',
      detail: 'The authenticated account does not have the required role.',
    });
  }
}

@Injectable()
export class SessionCsrfGuard implements CanActivate {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironmentProvider) {
    this.allowedOrigins = new Set([
      new URL(environment.WEB_BASE_URL).origin,
      ...environment.CORS_ALLOWED_ORIGINS.split(',').map((value) => new URL(value.trim()).origin),
    ]);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const origin = this.requestOrigin(request);
    if (origin && this.allowedOrigins.has(origin)) return true;
    throw new ApiProblemException({
      status: 403,
      code: 'CSRF_ORIGIN_INVALID',
      title: 'Untrusted request origin',
      detail: 'The request origin could not be verified.',
    });
  }

  private requestOrigin(request: FastifyRequest): string | null {
    const origin = request.headers.origin;
    if (typeof origin === 'string') {
      try {
        return new URL(origin).origin;
      } catch {
        return null;
      }
    }
    const referer = request.headers.referer;
    if (typeof referer === 'string') {
      try {
        return new URL(referer).origin;
      } catch {
        return null;
      }
    }
    return null;
  }
}
