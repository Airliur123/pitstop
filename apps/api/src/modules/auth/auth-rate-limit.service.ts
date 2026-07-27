import { createHmac, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { RedisService } from '../../common/redis/redis.service';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';

@Injectable()
export class AuthRateLimitService {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async enforceMagicLinkRequest(ip: string, normalizedEmail: string): Promise<void> {
    await this.enforce([
      ['request:global', 'global', this.environment.AUTH_REQUEST_GLOBAL_MAX],
      ['request:ip', ip, this.environment.AUTH_REQUEST_IP_MAX],
      ['request:email', normalizedEmail, this.environment.AUTH_REQUEST_EMAIL_MAX],
    ]);
  }

  async enforceVerification(ip: string): Promise<void> {
    await this.enforce([
      ['verify:global', 'global', this.environment.AUTH_VERIFY_GLOBAL_MAX],
      ['verify:ip', ip, this.environment.AUTH_VERIFY_IP_MAX],
    ]);
  }

  private async enforce(
    rules: readonly (readonly [scope: string, identifier: string, maximum: number])[],
  ): Promise<void> {
    const windowMilliseconds = this.environment.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1_000;
    const keys = rules.map(
      ([scope, identifier]) =>
        `pitstop:rate-limit:auth:v1:${scope}:${this.hashIdentifier(scope, identifier)}`,
    );
    const result = await this.redis.run((client) =>
      client.eval(
        `local exceeded = 0
         local longest_ttl = 0
         for index, key in ipairs(KEYS) do
           local current = redis.call('INCR', key)
           if current == 1 then redis.call('PEXPIRE', key, ARGV[1]) end
           local ttl = redis.call('PTTL', key)
           if ttl > longest_ttl then longest_ttl = ttl end
           if current > tonumber(ARGV[index + 1]) then exceeded = 1 end
         end
         return {exceeded, longest_ttl}`,
        keys.length,
        ...keys,
        windowMilliseconds,
        ...rules.map(([, , maximum]) => maximum),
      ),
    );
    if (result === null) {
      throw new ApiProblemException({
        status: 503,
        code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
        title: 'Authentication temporarily unavailable',
        detail: 'Authentication is temporarily unavailable. Please try again later.',
      });
    }
    if (Array.isArray(result) && Number(result[0]) === 1) {
      throw new ApiProblemException({
        status: 429,
        code: 'AUTH_RATE_LIMITED',
        title: 'Too many authentication attempts',
        detail: 'Too many authentication attempts. Please try again later.',
      });
    }
  }

  private hashIdentifier(scope: string, identifier: string): string {
    return createHmac('sha256', this.environment.AUTH_TOKEN_SECRET ?? ephemeralRateLimitSecret)
      .update(`${scope}:${identifier}`)
      .digest('base64url');
  }
}

const ephemeralRateLimitSecret = randomBytes(32).toString('base64url');
