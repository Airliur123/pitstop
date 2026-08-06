import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { DEFAULT_LOG_REDACTION_PATHS } from '@pitstop/config/security';
import { LoggerModule } from 'nestjs-pino';

import { CacheModule } from './common/cache/cache.module';
import { DatabaseModule } from './common/database/database.module';
import { PublicRateLimitInterceptor } from './common/rate-limit/public-rate-limit.interceptor';
import { RedisModule } from './common/redis/redis.module';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from './configuration';
import { ConfigurationModule } from './configuration.module';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { RequestIdInterceptor } from './http/request-id.interceptor';
import { resolveCorrelationIdentifier, resolveRequestIdentifier } from './http/request-identifiers';
import { AdminModerationModule } from './modules/admin-moderation/admin-moderation.module';
import { AuthModule } from './modules/auth/auth.module';
import { AUTH_LOG_REDACTION_PATHS } from './modules/auth/auth-security';
import { CONTRIBUTION_LOG_REDACTION_PATHS } from './modules/contributions/contribution-security';
import { ContributionsModule } from './modules/contributions/contributions.module';
import { GoogleFormModule } from './modules/google-form-integration/google-form.module';
import { INTEGRATION_LOG_REDACTION_PATHS } from './modules/google-form-integration/integration-security';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';
import { ApiMetricsInterceptor } from './modules/observability/api-metrics.interceptor';
import { ObservabilityModule } from './modules/observability/observability.module';
import { PublicCategoriesModule } from './modules/public-categories/public-categories.module';
import { PublicPlacesModule } from './modules/public-places/public-places.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { REPORT_LOG_REDACTION_PATHS } from './modules/reports/reports-security';

@Module({
  imports: [
    ConfigurationModule,
    DatabaseModule,
    RedisModule,
    CacheModule,
    AuthModule,
    AdminModerationModule,
    ContributionsModule,
    GoogleFormModule,
    PublicCategoriesModule,
    PublicPlacesModule,
    RecommendationsModule,
    ReportsModule,
    ObservabilityModule,
    LoggerModule.forRootAsync({
      imports: [ConfigurationModule],
      inject: [API_ENVIRONMENT],
      useFactory: (environment: ApiEnvironmentProvider) => ({
        pinoHttp: {
          autoLogging: {
            ignore(request) {
              const path = request.url?.split('?')[0];
              return path === '/health/live' || path === '/health/ready';
            },
          },
          base: {
            environment: environment.NODE_ENV,
            release: environment.RELEASE_VERSION,
            service: 'pitstop-api',
          },
          customProps(request) {
            return {
              correlationId: resolveCorrelationIdentifier(
                request.headers['x-correlation-id'],
                typeof request.id === 'string' ? request.id : undefined,
              ),
            };
          },
          level: environment.LOG_LEVEL,
          genReqId(request) {
            return resolveRequestIdentifier(request.headers['x-request-id']);
          },
          serializers: {
            req(request) {
              return {
                id: request.id,
                method: request.method,
                route:
                  typeof request.routeOptions?.url === 'string'
                    ? request.routeOptions.url
                    : 'unmatched',
              };
            },
            res(response) {
              return { statusCode: response.statusCode };
            },
          },
          redact: {
            paths: [
              ...DEFAULT_LOG_REDACTION_PATHS,
              ...AUTH_LOG_REDACTION_PATHS,
              ...CONTRIBUTION_LOG_REDACTION_PATHS,
              ...INTEGRATION_LOG_REDACTION_PATHS,
              ...REPORT_LOG_REDACTION_PATHS,
              'req.headers.set-cookie',
              'res.headers.set-cookie',
              'req.headers.x-pitstop-signature',
              'req.headers.x-csrf-token',
              'req.body',
              'body',
              'rawPayload',
              'preciseLatitude',
              'preciseLongitude',
              'evidence',
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
    { provide: APP_INTERCEPTOR, useExisting: ApiMetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: PublicRateLimitInterceptor },
  ],
})
export class AppModule {}
