import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Queue, Worker as BullWorker } from 'bullmq';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { WORKER_ENVIRONMENT, type WorkerEnvironmentProvider } from './configuration';

const FOUNDATION_QUEUE = 'pitstop-foundation';

@Injectable()
export class WorkerLifecycleService implements OnModuleInit, OnApplicationShutdown {
  private connection?: Redis;
  private queue?: Queue;
  private worker?: BullWorker;

  constructor(
    @Inject(WORKER_ENVIRONMENT) private readonly environment: WorkerEnvironmentProvider,
    @InjectPinoLogger(WorkerLifecycleService.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.environment.NODE_ENV === 'test') {
      this.logger.info('PitStop worker test bootstrap completed without external connections');
      return;
    }

    this.connection = new Redis(this.environment.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(FOUNDATION_QUEUE, { connection: this.connection });
    this.worker = new BullWorker(
      FOUNDATION_QUEUE,
      async (job) => {
        if (job.name !== 'foundation-smoke') {
          throw new Error(`Unsupported Phase 0 job: ${job.name}`);
        }
        return { processed: true };
      },
      { connection: this.connection.duplicate() },
    );
    await this.queue.add('foundation-smoke', { phase: 0 }, { removeOnComplete: true });
    this.logger.info('PitStop worker connected to the Phase 0 foundation queue');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
