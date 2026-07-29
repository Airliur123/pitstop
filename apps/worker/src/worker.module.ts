import { Module } from '@nestjs/common';
import { parseWorkerEnvironment } from '@pitstop/config';
import { LoggerModule } from 'nestjs-pino';

import { WORKER_ENVIRONMENT } from './configuration';
import { ConfiguredGeocodingAdapter } from './geocoding.adapters';
import { GEOCODING_PORT } from './geocoding.port';
import { IntegrationJobService } from './integration-job.service';
import { IntegrationWorkerRepository } from './integration-worker.repository';
import {
  createWorkerDatabasePool,
  WORKER_DATABASE_POOL,
  WorkerDatabaseLifecycle,
} from './worker-database';
import { WorkerLifecycleService } from './worker-lifecycle.service';

@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' } })],
  providers: [
    {
      provide: WORKER_ENVIRONMENT,
      useFactory: () => parseWorkerEnvironment(process.env),
    },
    {
      provide: WORKER_DATABASE_POOL,
      inject: [WORKER_ENVIRONMENT],
      useFactory: createWorkerDatabasePool,
    },
    {
      provide: GEOCODING_PORT,
      useClass: ConfiguredGeocodingAdapter,
    },
    IntegrationWorkerRepository,
    IntegrationJobService,
    WorkerDatabaseLifecycle,
    WorkerLifecycleService,
  ],
})
export class WorkerModule {}
