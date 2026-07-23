import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { WorkerModule } from './worker.module';

export async function bootstrapWorker(): Promise<INestApplicationContext> {
  const application = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  application.useLogger(application.get(Logger));
  application.enableShutdownHooks();
  return application;
}
