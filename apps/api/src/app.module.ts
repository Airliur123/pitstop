import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { parseApiEnvironment } from '@pitstop/config';
import { LoggerModule } from 'nestjs-pino';

import { API_ENVIRONMENT } from './configuration';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { RequestIdInterceptor } from './http/request-id.interceptor';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId(request) {
          const requestId = request.headers['x-request-id'];
          return typeof requestId === 'string' && requestId.length > 0 ? requestId : randomUUID();
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
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: API_ENVIRONMENT,
      useFactory: () => parseApiEnvironment(process.env),
    },
    HealthService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
  ],
})
export class AppModule {}
