import { Module } from '@nestjs/common';
import { parseWorkerEnvironment } from '@pitstop/config';
import { LoggerModule } from 'nestjs-pino';

import { WORKER_ENVIRONMENT } from './configuration';
import { WorkerLifecycleService } from './worker-lifecycle.service';

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' } })],
  providers: [
    {
      provide: WORKER_ENVIRONMENT,
      useFactory: () => parseWorkerEnvironment(process.env),
    },
    WorkerLifecycleService,
  ],
})
export class WorkerModule {}
