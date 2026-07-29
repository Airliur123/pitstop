import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type {
  DetectDuplicatePlaceJob,
  GeocodeContributionJob,
  PitstopJobName,
  ProcessGoogleFormSubmissionJob,
} from '@pitstop/contracts';
import { Job, Queue, Worker as BullWorker } from 'bullmq';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { WORKER_ENVIRONMENT, type WorkerEnvironmentProvider } from './configuration';
import { IntegrationJobService } from './integration-job.service';
import { IntegrationWorkerRepository } from './integration-worker.repository';
import { classifyWorkerError, integrationJobPolicy } from './job-policy';

export const INTEGRATION_QUEUE = 'pitstop-integration';
export const INTEGRATION_DLQ = 'pitstop-integration-dlq';

type IntegrationJobData =
  DetectDuplicatePlaceJob | GeocodeContributionJob | ProcessGoogleFormSubmissionJob;

@Injectable()
export class WorkerLifecycleService implements OnModuleInit, OnApplicationShutdown {
  private connection?: Redis;
  private deadLetterQueue?: Queue;
  private queue?: Queue;
  private reconcileTimer?: NodeJS.Timeout;
  private reconciling = false;
  private worker?: BullWorker;
  private workerConnection?: Redis;

  constructor(
    @Inject(WORKER_ENVIRONMENT) private readonly environment: WorkerEnvironmentProvider,
    @Inject(IntegrationJobService) private readonly jobs: IntegrationJobService,
    @Inject(IntegrationWorkerRepository) private readonly repository: IntegrationWorkerRepository,
    @InjectPinoLogger(WorkerLifecycleService.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.environment.NODE_ENV === 'test') {
      this.logger.info('PitStop integration worker test bootstrap completed without connections');
      return;
    }

    this.connection = new Redis(this.environment.REDIS_URL, { maxRetriesPerRequest: null });
    this.workerConnection = this.connection.duplicate();
    this.queue = new Queue(INTEGRATION_QUEUE, { connection: this.connection });
    this.deadLetterQueue = new Queue(INTEGRATION_DLQ, { connection: this.connection });
    this.worker = new BullWorker<IntegrationJobData>(
      INTEGRATION_QUEUE,
      (job) =>
        withTimeout(
          this.process(job),
          this.environment.GEOCODING_HTTP_TIMEOUT_MS,
          `JOB_TIMEOUT:${job.name}`,
        ),
      { concurrency: 4, connection: this.workerConnection },
    );
    this.worker.on('failed', (job, error) => {
      if (job) void this.handleFailure(job, error);
    });
    this.worker.on('error', (error) => {
      this.logger.error({ errorClass: error.name, jobName: 'worker-runtime' });
    });

    await this.reconcile();
    this.reconcileTimer = setInterval(() => {
      void this.reconcile();
    }, this.environment.WORKER_RECONCILE_INTERVAL_MS);
    this.reconcileTimer.unref();
    this.logger.info({
      jobName: 'worker-bootstrap',
      queue: INTEGRATION_QUEUE,
      status: 'READY',
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    await this.worker?.close();
    await this.queue?.close();
    await this.deadLetterQueue?.close();
    this.workerConnection?.disconnect();
    this.connection?.disconnect();
  }

  private async process(job: Job<IntegrationJobData>): Promise<unknown> {
    const data = { ...job.data, attempt: job.attemptsMade + 1 };
    try {
      if (job.name === 'process-google-form-submission') {
        const next = await this.jobs.processSubmission(data);
        if (next) await this.add('geocode-contribution', next);
        return { contributionId: next?.contributionId ?? null, processed: true };
      }
      if (job.name === 'geocode-contribution') {
        const next = await this.jobs.geocode(data);
        if (next) await this.add('detect-duplicate-place', next);
        return { duplicateDetectionQueued: Boolean(next), processed: true };
      }
      if (job.name === 'detect-duplicate-place') {
        await this.jobs.detectDuplicates(data);
        return { processed: true };
      }
      throw new Error('UNSUPPORTED_INTEGRATION_JOB');
    } catch (error) {
      if (!classifyWorkerError(error).retryable) job.discard();
      throw error;
    }
  }

  private async handleFailure(job: Job<IntegrationJobData>, error: Error): Promise<void> {
    const classification = classifyWorkerError(error);
    const exhausted =
      !classification.retryable ||
      job.attemptsMade >= Number(job.opts.attempts ?? integrationJobPolicy.attempts);
    await this.repository.recordJobFailure(
      job.data.inboxId,
      job.name as PitstopJobName,
      classification,
      exhausted,
    );
    this.logger.warn({
      attempt: job.attemptsMade,
      correlationId: job.data.correlationId,
      errorClass: classification.errorClass,
      errorCode: classification.code,
      exhausted,
      inboxId: job.data.inboxId,
      jobName: job.name,
      requestId: job.data.requestId,
    });
    if (exhausted) {
      await this.deadLetterQueue?.add(
        `${job.name}-dead-letter`,
        {
          contributionId: 'contributionId' in job.data ? job.data.contributionId : undefined,
          correlationId: job.data.correlationId,
          errorClass: classification.errorClass,
          errorCode: classification.code,
          failedAt: new Date().toISOString(),
          inboxId: job.data.inboxId,
          jobName: job.name,
        },
        { removeOnComplete: false, removeOnFail: false },
      );
    }
  }

  private async reconcile(): Promise<void> {
    if (this.reconciling || !this.queue) return;
    this.reconciling = true;
    try {
      const [processJobs, geocodeJobs, duplicateJobs] = await Promise.all([
        this.repository.findEnqueueCandidates(),
        this.repository.claimGeocodingCandidates(this.environment.WORKER_STAGE_LEASE_SECONDS),
        this.repository.claimDuplicateCandidates(this.environment.WORKER_STAGE_LEASE_SECONDS),
      ]);
      for (const job of processJobs) {
        await this.add('process-google-form-submission', job);
        await this.repository.markQueued(job.inboxId);
      }
      for (const job of geocodeJobs) await this.add('geocode-contribution', job);
      for (const job of duplicateJobs) await this.add('detect-duplicate-place', job);
      if (processJobs.length + geocodeJobs.length + duplicateJobs.length > 0) {
        this.logger.info({
          duplicateJobs: duplicateJobs.length,
          geocodeJobs: geocodeJobs.length,
          jobName: 'integration-reconciliation',
          processJobs: processJobs.length,
          status: 'ENQUEUED',
        });
      }
    } catch (error) {
      const classification = classifyWorkerError(error);
      this.logger.error({
        errorClass: classification.errorClass,
        errorCode: classification.code,
        jobName: 'integration-reconciliation',
        status: 'FAILED',
      });
    } finally {
      this.reconciling = false;
    }
  }

  private async add(name: PitstopJobName, data: IntegrationJobData): Promise<void> {
    await this.queue?.add(name, data, {
      ...integrationJobPolicy,
      jobId: `${name}-${data.inboxId}`,
    });
  }
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMilliseconds: number,
  code = 'JOB_TIMEOUT',
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(code)), timeoutMilliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
