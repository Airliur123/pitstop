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
    trustProxy: false,
    genReqId(request: IncomingMessage) {
      const requestId = request.headers['x-request-id'];
      return typeof requestId === 'string' && requestId.length > 0 ? requestId : randomUUID();
    },
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1', {
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
    .setDescription('Phase 0 REST API foundation')
    .setVersion('0.0.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfiguration));

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
