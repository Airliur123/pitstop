import { createHmac, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { RedisService } from '../../common/redis/redis.service';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';

@Injectable()
export class ContributionsRateLimitService {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async enforce(userId: string, operation: 'create' | 'submit' | 'update'): Promise<void> {
    const identifier = createHmac(
      'sha256',
      this.environment.AUTH_TOKEN_SECRET ?? ephemeralContributionRateLimitSecret,
    )
      .update(`contribution:${operation}:${userId}`)
      .digest('base64url');
    const key = `pitstop:rate-limit:contribution:v1:${operation}:${identifier}`;
    const windowMilliseconds = this.environment.CONTRIBUTION_RATE_LIMIT_WINDOW_SECONDS * 1_000;
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
        code: 'CONTRIBUTION_RATE_LIMIT_UNAVAILABLE',
        title: 'Contribution temporarily unavailable',
        detail: 'Contribution changes are temporarily unavailable. Please try again later.',
      });
    }
    if (Number(result) > this.environment.CONTRIBUTION_RATE_LIMIT_MAX) {
      throw new ApiProblemException({
        status: 429,
        code: 'CONTRIBUTION_RATE_LIMITED',
        title: 'Too many contribution changes',
        detail: 'Too many contribution changes were requested. Please try again later.',
      });
    }
  }
}

const ephemeralContributionRateLimitSecret = randomBytes(32).toString('base64url');
