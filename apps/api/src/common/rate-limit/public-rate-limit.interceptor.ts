import { createHash } from 'node:crypto';

import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';

import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { ApiProblemException } from '../errors/api-problem.exception';
import { RedisService } from '../redis/redis.service';

interface RateLimitResult {
  readonly current: number;
  readonly ttlMilliseconds: number;
}

@Injectable()
export class PublicRateLimitInterceptor implements NestInterceptor {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const path = request.url.split('?')[0] ?? request.url;
    const publicPrefix = `/${this.environment.API_PREFIX}/${this.environment.API_VERSION}/public/`;
    if (!path.startsWith(publicPrefix)) return next.handle();

    const isRecommendation = path === `${publicPrefix}recommendations`;
    const maximum = isRecommendation
      ? this.environment.RECOMMENDATION_RATE_LIMIT_MAX
      : this.environment.PUBLIC_RATE_LIMIT_MAX;
    const result = await this.increment(request.ip, isRecommendation ? 'recommendations' : 'read');
    if (result === null) return next.handle();

    const remaining = Math.max(0, maximum - result.current);
    const retryAfter = Math.max(1, Math.ceil(result.ttlMilliseconds / 1_000));
    reply.headers({
      'x-ratelimit-limit': maximum,
      'x-ratelimit-remaining': remaining,
      'x-ratelimit-reset': retryAfter,
    });
    if (result.current > maximum) {
      reply.header('retry-after', retryAfter);
      throw new ApiProblemException({
        status: 429,
        code: 'RATE_LIMITED',
        title: 'Rate limit exceeded',
        detail: 'Too many public API requests. Retry after the indicated delay.',
      });
    }
    return next.handle();
  }

  private async increment(ip: string, scope: string): Promise<RateLimitResult | null> {
    const identifier = createHash('sha256').update(ip).digest('base64url');
    const key = `pitstop:rate-limit:v1:${scope}:${identifier}`;
    const windowMilliseconds = this.environment.PUBLIC_RATE_LIMIT_WINDOW_SECONDS * 1_000;
    const result = await this.redis.run((client) =>
      client.eval(
        `local current = redis.call('INCR', KEYS[1])
         if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         local ttl = redis.call('PTTL', KEYS[1])
         return {current, ttl}`,
        1,
        key,
        windowMilliseconds,
      ),
    );
    if (!Array.isArray(result) || result.length !== 2) return null;
    const current = Number(result[0]);
    const ttlMilliseconds = Number(result[1]);
    return Number.isFinite(current) && Number.isFinite(ttlMilliseconds)
      ? { current, ttlMilliseconds: Math.max(0, ttlMilliseconds) }
      : null;
  }
}
