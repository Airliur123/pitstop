import { createHmac, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { RedisService } from '../../common/redis/redis.service';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';

@Injectable()
export class AdminModerationRateLimitService {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async enforce(adminId: string, kind: 'mutation' | 'read'): Promise<void> {
    const identifier = createHmac(
      'sha256',
      this.environment.AUTH_TOKEN_SECRET ?? ephemeralAdminRateLimitSecret,
    )
      .update(`admin:${kind}:${adminId}`)
      .digest('base64url');
    const key = `pitstop:rate-limit:admin:v1:${kind}:${identifier}`;
    const windowMilliseconds = this.environment.ADMIN_RATE_LIMIT_WINDOW_SECONDS * 1_000;
    const maximum =
      kind === 'mutation'
        ? this.environment.ADMIN_MUTATION_RATE_LIMIT_MAX
        : this.environment.ADMIN_READ_RATE_LIMIT_MAX;
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
        code: 'ADMIN_RATE_LIMIT_UNAVAILABLE',
        title: 'Admin operations temporarily unavailable',
        detail: 'Admin operations are temporarily unavailable. Please try again later.',
      });
    }
    if (Number(result) > maximum) {
      throw new ApiProblemException({
        status: 429,
        code: 'ADMIN_RATE_LIMITED',
        title: 'Too many admin requests',
        detail: 'Too many admin requests were made. Please retry later.',
      });
    }
  }
}

const ephemeralAdminRateLimitSecret = randomBytes(32).toString('base64url');
