import { Inject, Injectable } from '@nestjs/common';
import type {
  DetectDuplicatePlaceJob,
  GeocodeContributionJob,
  ProcessGoogleFormSubmissionJob,
} from '@pitstop/contracts';
import {
  detectDuplicatePlaceJobSchema,
  geocodeContributionJobSchema,
  processGoogleFormSubmissionJobSchema,
} from '@pitstop/validation';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { WORKER_ENVIRONMENT, type WorkerEnvironmentProvider } from './configuration';
import { GEOCODING_PORT, type GeocodingPort } from './geocoding.port';
import { IntegrationWorkerRepository } from './integration-worker.repository';
import { PermanentWorkerError } from './job-policy';
import { sanitizeJobIdentifiers } from './worker-observability';

@Injectable()
export class IntegrationJobService {
  constructor(
    @Inject(WORKER_ENVIRONMENT) private readonly environment: WorkerEnvironmentProvider,
    @Inject(GEOCODING_PORT) private readonly geocoder: GeocodingPort,
    @Inject(IntegrationWorkerRepository) private readonly repository: IntegrationWorkerRepository,
    @InjectPinoLogger(IntegrationJobService.name) private readonly logger: PinoLogger,
  ) {}

  async processSubmission(value: unknown): Promise<GeocodeContributionJob | null> {
    const job = sanitizeJobIdentifiers(
      processGoogleFormSubmissionJobSchema.parse(value) as ProcessGoogleFormSubmissionJob,
    );
    const startedAt = Date.now();
    const next = await this.repository.processSubmission(job.inboxId);
    this.logSuccess('process-google-form-submission', job, startedAt, next?.contributionId);
    return next;
  }

  async geocode(value: unknown): Promise<DetectDuplicatePlaceJob | null> {
    const job = sanitizeJobIdentifiers(
      geocodeContributionJobSchema.parse(value) as GeocodeContributionJob,
    );
    const startedAt = Date.now();
    const input = await this.repository.geocodeInput(job);
    if (!input) throw new PermanentWorkerError('GEOCODING_SUBJECT_NOT_FOUND');
    await this.repository.markGeocodingProcessing(job.inboxId);
    const result = await this.geocoder.geocode({
      address: input.payload.address,
      area: input.payload.area,
      landmark: input.payload.landmark,
      mapUrl: input.payload.mapUrl,
    });
    if (result.status === 'NOT_FOUND') {
      await this.repository.markPermanentGeocodingFailure(
        job,
        result.provider,
        'GEOCODING_NOT_FOUND',
      );
      throw new PermanentWorkerError('GEOCODING_NOT_FOUND');
    }
    const lowConfidence = result.confidence < this.environment.GEOCODING_CONFIDENCE_THRESHOLD;
    await this.repository.saveGeocodingResult(job, result, lowConfidence);
    this.logSuccess(
      'geocode-contribution',
      job,
      startedAt,
      job.contributionId,
      lowConfidence ? 'LOW_CONFIDENCE' : 'SUCCEEDED',
    );
    return lowConfidence
      ? null
      : {
          ...job,
          attempt: 0,
          enqueuedAt: new Date().toISOString(),
          idempotencyKey: `google-form:duplicate:${job.contributionId}`,
        };
  }

  async detectDuplicates(value: unknown): Promise<void> {
    const job = sanitizeJobIdentifiers(
      detectDuplicatePlaceJobSchema.parse(value) as DetectDuplicatePlaceJob,
    );
    const startedAt = Date.now();
    await this.repository.markDuplicateProcessing(job.inboxId);
    const hints = await this.repository.findDuplicateHints(
      job,
      this.environment.DUPLICATE_RADIUS_METERS,
    );
    await this.repository.saveDuplicateHints(job, hints);
    this.logSuccess(
      'detect-duplicate-place',
      job,
      startedAt,
      job.contributionId,
      'SUCCEEDED',
      hints.length,
    );
  }

  private logSuccess(
    jobName: string,
    job: ProcessGoogleFormSubmissionJob | GeocodeContributionJob,
    startedAt: number,
    contributionId?: string,
    status = 'SUCCEEDED',
    duplicateHintCount?: number,
  ): void {
    this.logger.info({
      attempt: job.attempt,
      contributionId,
      correlationId: job.correlationId,
      durationMs: Date.now() - startedAt,
      duplicateHintCount,
      inboxId: job.inboxId,
      jobName,
      requestId: job.requestId,
      status,
    });
  }
}
