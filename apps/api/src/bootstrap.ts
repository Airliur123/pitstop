import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { parseApiEnvironment, parseCorsOrigins } from '@pitstop/config';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';

export async function createApiApplication(): Promise<NestFastifyApplication> {
  const environment = parseApiEnvironment(process.env);
  const adapter = new FastifyAdapter({
    bodyLimit: environment.API_BODY_LIMIT_BYTES,
    trustProxy: environment.TRUST_PROXY,
    genReqId(request: IncomingMessage) {
      const requestId = request.headers['x-request-id'];
      return typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId)
        ? requestId
        : randomUUID();
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const globalPrefix = `${environment.API_PREFIX}/${environment.API_VERSION}`;
  app.setGlobalPrefix(globalPrefix, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }),
  );
  await app.register(cors, {
    credentials: true,
    origin: parseCorsOrigins(environment.CORS_ALLOWED_ORIGINS),
  });
  await app.register(helmet, { contentSecurityPolicy: false });

  const swaggerConfiguration = new DocumentBuilder()
    .setTitle('PitStop API')
    .setDescription('PitStop Phase 3 public places and recommendation REST API')
    .setVersion('1.0.0')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, swaggerConfiguration);
  if (environment.API_SWAGGER_ENABLED) {
    SwaggerModule.setup(`${environment.API_PREFIX}/docs`, app, openApiDocument);
    app
      .getHttpAdapter()
      .getInstance()
      .get(`/${environment.API_PREFIX}/openapi.json`, async (_request, reply) => {
        await reply.type('application/json').send(openApiDocument);
      });
  }

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', async (request, reply) => {
      if (request.url.length > environment.API_MAX_QUERY_LENGTH) {
        const instance = request.url.split('?')[0] ?? request.url;
        await reply
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
