import { createHmac, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { RedisService } from '../../common/redis/redis.service';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';

@Injectable()
export class GoogleFormRateLimitService {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async enforceInbound(sourceId: string, ipAddress: string): Promise<void> {
    await this.enforce(
      `inbound:${sourceId}:${ipAddress}`,
      this.environment.GOOGLE_FORM_RATE_LIMIT_WINDOW_SECONDS,
      this.environment.GOOGLE_FORM_RATE_LIMIT_MAX,
      'INTEGRATION',
    );
  }

  async enforceAdmin(adminId: string, mutation: boolean): Promise<void> {
    await this.enforce(
      `admin:${mutation ? 'mutation' : 'read'}:${adminId}`,
      this.environment.ADMIN_RATE_LIMIT_WINDOW_SECONDS,
      mutation
        ? this.environment.ADMIN_MUTATION_RATE_LIMIT_MAX
        : this.environment.ADMIN_READ_RATE_LIMIT_MAX,
      'ADMIN_INTEGRATION',
    );
  }

  private async enforce(
    identifier: string,
    windowSeconds: number,
    maximum: number,
    codePrefix: string,
  ): Promise<void> {
    const keyHash = createHmac(
      'sha256',
      this.environment.AUTH_TOKEN_SECRET ??
        this.environment.GOOGLE_FORM_CURRENT_SECRET ??
        ephemeralRateLimitSecret,
    )
      .update(identifier)
      .digest('base64url');
    const result = await this.redis.run((client) =>
      client.eval(
        `local current = redis.call('INCR', KEYS[1])
         if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         return current`,
        1,
        `pitstop:rate-limit:google-form:v1:${keyHash}`,
        windowSeconds * 1_000,
      ),
    );
    if (result === null) {
      throw new ApiProblemException({
        status: 503,
        code: `${codePrefix}_RATE_LIMIT_UNAVAILABLE`,
        title: 'Integration temporarily unavailable',
        detail: 'Request admission is temporarily unavailable. Retry with the same submission ID.',
      });
    }
    if (Number(result) > maximum) {
      throw new ApiProblemException({
        status: 429,
        code: `${codePrefix}_RATE_LIMITED`,
        title: 'Too many integration requests',
        detail: 'Too many requests were received. Retry after the current rate window.',
      });
    }
  }
}

const ephemeralRateLimitSecret = randomBytes(32).toString('base64url');
