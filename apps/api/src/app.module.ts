import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { CacheModule } from './common/cache/cache.module';
import { DatabaseModule } from './common/database/database.module';
import { PublicRateLimitInterceptor } from './common/rate-limit/public-rate-limit.interceptor';
import { RedisModule } from './common/redis/redis.module';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from './configuration';
import { ConfigurationModule } from './configuration.module';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { RequestIdInterceptor } from './http/request-id.interceptor';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';
import { PublicCategoriesModule } from './modules/public-categories/public-categories.module';
import { PublicPlacesModule } from './modules/public-places/public-places.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';

@Module({
  imports: [
    ConfigurationModule,
    DatabaseModule,
    RedisModule,
    CacheModule,
    PublicCategoriesModule,
    PublicPlacesModule,
    RecommendationsModule,
    LoggerModule.forRootAsync({
      imports: [ConfigurationModule],
      inject: [API_ENVIRONMENT],
      useFactory: (environment: ApiEnvironmentProvider) => ({
        pinoHttp: {
          level: environment.LOG_LEVEL,
          genReqId(request) {
            const requestId = request.headers['x-request-id'];
            return typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId)
              ? requestId
              : randomUUID();
          },
          serializers: {
            req(request) {
              const url = typeof request.url === 'string' ? request.url : '';
              return {
                id: request.id,
                method: request.method,
                url: url.split('?')[0],
              };
            },
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers.x-integration-signature',
              'password',
              'token',
            ],
            censor: '[REDACTED]',
          },
        },
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: PublicRateLimitInterceptor },
  ],
})
export class AppModule {}
