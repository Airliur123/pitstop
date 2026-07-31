import { createHmac, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { RedisService } from '../../common/redis/redis.service';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';

@Injectable()
export class ReportsRateLimitService {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async enforce(
    userId: string,
    operation: 'activity' | 'confirmation' | 'report',
    placeId?: string,
  ): Promise<void> {
    const identifier = createHmac(
      'sha256',
      this.environment.AUTH_TOKEN_SECRET ?? ephemeralReportsRateLimitSecret,
    )
      .update(`${operation}:${userId}:${placeId ?? 'none'}`)
      .digest('base64url');
    const key = `pitstop:rate-limit:reports:v1:${operation}:${identifier}`;
    const windowMilliseconds = this.environment.CONTRIBUTION_RATE_LIMIT_WINDOW_SECONDS * 1_000;
    const maximum = operation === 'activity' ? this.environment.ADMIN_READ_RATE_LIMIT_MAX : 20;
    const result = await this.redis.run((client) =>
      client.eval(
        `local current = redis.call('INCR', KEYS[1])
         if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         return current`,
        1,
        key,
        windowMilliseconds,
      ),
    );
    if (result === null) {
      throw new ApiProblemException({
        status: 503,
        code: 'REPORT_RATE_LIMIT_UNAVAILABLE',
        title: 'Report operation temporarily unavailable',
        detail: 'This operation is temporarily unavailable. Please try again later.',
      });
    }
    if (Number(result) > maximum) {
      throw new ApiProblemException({
        status: 429,
        code: 'REPORT_RATE_LIMITED',
        title: 'Too many report requests',
        detail: 'Too many requests were made for this user and Place. Please retry later.',
      });
    }
  }
}

const ephemeralReportsRateLimitSecret = randomBytes(32).toString('base64url');
