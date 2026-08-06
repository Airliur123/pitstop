import { Module } from '@nestjs/common';
import { parseWorkerEnvironment } from '@pitstop/config';
import { LoggerModule } from 'nestjs-pino';

import { WORKER_ENVIRONMENT } from './configuration';
import { ConfiguredGeocodingAdapter } from './geocoding.adapters';
import { GEOCODING_PORT } from './geocoding.port';
import { IntegrationJobService } from './integration-job.service';
import { IntegrationWorkerRepository } from './integration-worker.repository';
import { createWorkerDatabasePool, WORKER_DATABASE_POOL } from './worker-database';
import { WorkerLifecycleService } from './worker-lifecycle.service';
import { readWorkerRuntimeSettings, workerLogRedactPaths } from './worker-observability';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      useFactory: () => {
        const runtimeSettings = readWorkerRuntimeSettings();
        return {
          pinoHttp: {
            base: {
              environment: runtimeSettings.environment,
              release: runtimeSettings.release,
              service: runtimeSettings.service,
            },
            level: runtimeSettings.logLevel,
            redact: {
              censor: '[REDACTED]',
              paths: [...workerLogRedactPaths],
            },
          },
        };
      },
    }),
  ],
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
    WorkerLifecycleService,
  ],
})
export class WorkerModule {}
