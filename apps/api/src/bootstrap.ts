import type { IncomingMessage } from 'node:http';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { buildFastifyTrustProxy, parseApiEnvironment, parseCorsOrigins } from '@pitstop/config';
import { buildApiSecurityHeaders, serializeContentSecurityPolicy } from '@pitstop/config/security';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { registerGoogleFormBodyLimit } from './http/google-form-body-limit';
import { isAllowedRequestOrigin } from './http/origin-policy';
import { resolveCorrelationIdentifier, resolveRequestIdentifier } from './http/request-identifiers';

export async function createApiApplication(): Promise<NestFastifyApplication> {
  const environment = parseApiEnvironment(process.env);
  const adapter = new FastifyAdapter({
    bodyLimit: environment.API_BODY_LIMIT_BYTES,
    trustProxy: buildFastifyTrustProxy(environment),
    genReqId(request: IncomingMessage) {
      return resolveRequestIdentifier(request.headers['x-request-id']);
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  const globalPrefix = `${environment.API_PREFIX}/${environment.API_VERSION}`;
  const allowedOrigins = new Set(parseCorsOrigins(environment.CORS_ALLOWED_ORIGINS));
  const securityHeaders = buildApiSecurityHeaders({
    baseUrl: environment.API_BASE_URL,
    environment: environment.NODE_ENV,
  });
  const swaggerContentSecurityPolicy = serializeContentSecurityPolicy({
    'base-uri': ["'self'"],
    'connect-src': ["'self'"],
    'default-src': ["'self'"],
    'font-src': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'img-src': ["'self'", 'data:'],
    'object-src': ["'none'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
  });
  app.setGlobalPrefix(globalPrefix, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
  );
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', async (request, reply) => {
      const correlationId = resolveCorrelationIdentifier(
        request.headers['x-correlation-id'],
        request.id,
      );
      request.headers['x-correlation-id'] = correlationId;
      reply.header('x-correlation-id', correlationId).header('x-request-id', request.id);
      for (const [name, value] of Object.entries(securityHeaders)) {
        reply.header(name, value);
      }
      if (
        environment.API_SWAGGER_ENABLED &&
        request.url.split('?')[0]?.startsWith(`/${environment.API_PREFIX}/docs`)
      ) {
        reply.header('content-security-policy', swaggerContentSecurityPolicy);
      }
      if (!isAllowedRequestOrigin(request.headers.origin, allowedOrigins)) {
        await reply
          .header('cache-control', 'no-store, private')
          .type('application/problem+json')
          .status(403)
          .send({
            success: false,
            error: {
              code: 'CORS_ORIGIN_INVALID',
              message: 'The request origin is not allowed.',
            },
            requestId: request.id,
            type: 'https://pitstop.local/problems/cors-origin-invalid',
            title: 'Untrusted request origin',
            status: 403,
            code: 'CORS_ORIGIN_INVALID',
            detail: 'The request origin is not allowed.',
            instance: request.url.split('?')[0] ?? request.url,
          });
        return;
      }
      if (request.url.length > environment.API_MAX_QUERY_LENGTH) {
        const instance = request.url.split('?')[0] ?? request.url;
        await reply
          .header('cache-control', 'no-store, private')
          .type('application/problem+json')
          .status(400)
          .send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'The request URL exceeds the configured maximum length.',
            },
            requestId: request.id,
            type: 'https://pitstop.local/problems/validation-error',
            title: 'Invalid request',
            status: 400,
            code: 'VALIDATION_ERROR',
            detail: 'The request URL exceeds the configured maximum length.',
            instance,
          });
      }
    });
  await app.register(cors, {
    allowedHeaders: [
      'Accept',
      'Content-Type',
      'Idempotency-Key',
      'X-Correlation-Id',
      'X-Csrf-Token',
      'X-Request-Id',
      'X-Xsrf-Token',
    ],
    credentials: true,
    exposedHeaders: [
      'Retry-After',
      'X-Correlation-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-Id',
    ],
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'OPTIONS'],
    origin: parseCorsOrigins(environment.CORS_ALLOWED_ORIGINS),
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    hsts: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  registerGoogleFormBodyLimit(
    app.getHttpAdapter().getInstance(),
    `/${globalPrefix}/integrations/google-form/submissions`,
    environment.GOOGLE_FORM_BODY_LIMIT_BYTES,
  );

  if (environment.API_SWAGGER_ENABLED) {
    const swaggerConfiguration = new DocumentBuilder()
      .setTitle('PitStop API')
      .setDescription(
        'PitStop guest-first public, passwordless authentication, and owned contribution REST API',
      )
      .setVersion('1.0.0')
      .build();
    const openApiDocument = SwaggerModule.createDocument(app, swaggerConfiguration);
    SwaggerModule.setup(`${environment.API_PREFIX}/docs`, app, openApiDocument);
    app
      .getHttpAdapter()
      .getInstance()
      .get(`/${environment.API_PREFIX}/openapi.json`, async (_request, reply) => {
        await reply.type('application/json').send(openApiDocument);
      });
  }

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export async function bootstrapApi(): Promise<NestFastifyApplication> {
  const environment = parseApiEnvironment(process.env);
  const app = await createApiApplication();
  await app.listen(environment.API_PORT, '127.0.0.1');
  return app;
}
