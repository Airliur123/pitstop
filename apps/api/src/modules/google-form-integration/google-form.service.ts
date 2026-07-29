import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminGoogleFormIntegrationStatus,
  AdminGoogleFormSubmissionDetail,
  AdminGoogleFormSubmissionList,
  AuthUser,
  GoogleFormAcceptedSubmission,
  ReplayGoogleFormSubmissionResult,
} from '@pitstop/contracts';
import {
  type AdminGoogleFormSubmissionListQuery,
  canonicalizeGoogleFormPayload,
  canonicalJson,
  googleFormInboundSubmissionSchema,
} from '@pitstop/validation';
import type { FastifyRequest } from 'fastify';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { ApiProblemException } from '../../common/errors/api-problem.exception';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { GoogleFormRepository, GoogleFormRepositoryError } from './google-form.repository';
import { GoogleFormRateLimitService } from './google-form-rate-limit.service';
import { type VerifiedIntegrationRequest, verifyIntegrationRequest } from './integration-security';

@Injectable()
export class GoogleFormService {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(GoogleFormRepository) private readonly repository: GoogleFormRepository,
    @Inject(GoogleFormRateLimitService) private readonly rateLimit: GoogleFormRateLimitService,
    @InjectPinoLogger(GoogleFormService.name) private readonly logger: PinoLogger,
  ) {}

  async accept(
    request: FastifyRequest,
    body: unknown,
    headers: {
      readonly externalSubmissionId: unknown;
      readonly keyId: unknown;
      readonly signature: unknown;
      readonly sourceId: unknown;
      readonly timestamp: unknown;
    },
  ): Promise<GoogleFormAcceptedSubmission> {
    this.assertContentType(request);
    const canonicalBody = this.assertBodySize(body);
    let verified: VerifiedIntegrationRequest;
    try {
      verified = verifyIntegrationRequest({
        body,
        environment: this.environment,
        ...headers,
      });
      await this.rateLimit.enforceInbound(verified.sourceId, request.ip);
    } catch (error) {
      this.logger.warn({
        correlationId: request.id,
        errorCode: safeProblemCode(error),
        event: 'INTEGRATION_AUTH_REJECTED',
        sourceId: safeSourceId(headers.sourceId),
      });
      throw error;
    }
    const parsed = googleFormInboundSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      this.logger.warn({
        correlationId: request.id,
        errorCode: 'GOOGLE_FORM_PAYLOAD_INVALID',
        event: 'INTEGRATION_PAYLOAD_REJECTED',
        sourceId: verified.sourceId,
      });
      throw new ApiProblemException({
        status: 400,
        code: 'GOOGLE_FORM_PAYLOAD_INVALID',
        title: 'Invalid Google Form submission',
        detail: 'The signed submission does not match the canonical payload schema.',
        validationErrors: parsed.error.issues.map((issue) => ({
          field: issue.path.map(String).join('.') || 'body',
          message: issue.message,
        })),
      });
    }

    const receivedAt = new Date().toISOString();
    const canonicalPayload = canonicalizeGoogleFormPayload(parsed.data, {
      externalSubmissionId: verified.externalSubmissionId,
      receivedAt,
      sourceId: verified.sourceId,
    });
    const requestHash = createHash('sha256').update(canonicalBody).digest('hex');
    try {
      const accepted = await this.repository.accept({
        acceptedKeyId: verified.acceptedKeyId,
        canonicalPayload,
        correlationId: request.id,
        environment: this.environment,
        externalSubmissionId: verified.externalSubmissionId,
        requestHash,
      });
      this.logger.info({
        correlationId: request.id,
        inboxId: accepted.inboxId,
        sourceId: verified.sourceId,
        status: accepted.status,
        transition: accepted.duplicate ? 'DUPLICATE_ACCEPTED' : 'RECEIVED',
      });
      return accepted;
    } catch (error) {
      if (!(error instanceof GoogleFormRepositoryError)) throw error;
      if (error.code === 'BODY_CONFLICT') {
        throw new ApiProblemException({
          status: 409,
          code: 'INTEGRATION_SUBMISSION_CONFLICT',
          title: 'Submission identity conflict',
          detail: 'This external submission ID was already accepted with different content.',
        });
      }
      throw new ApiProblemException({
        status: 403,
        code: 'INTEGRATION_SOURCE_DISABLED',
        title: 'Integration source disabled',
        detail: 'The configured integration source is disabled.',
      });
    }
  }

  async status(admin: AuthUser): Promise<AdminGoogleFormIntegrationStatus> {
    await this.rateLimit.enforceAdmin(admin.id, false);
    return this.repository.status(this.environment);
  }

  async list(
    admin: AuthUser,
    input: AdminGoogleFormSubmissionListQuery,
  ): Promise<AdminGoogleFormSubmissionList> {
    await this.rateLimit.enforceAdmin(admin.id, false);
    return this.repository.list({
      ...input,
      sourceCode: this.environment.GOOGLE_FORM_SOURCE_ID,
    });
  }

  async detail(admin: AuthUser, id: string): Promise<AdminGoogleFormSubmissionDetail> {
    await this.rateLimit.enforceAdmin(admin.id, false);
    const result = await this.repository.detail(id, this.environment.GOOGLE_FORM_SOURCE_ID);
    if (!result) throw submissionNotFound();
    return result;
  }

  async replay(
    admin: AuthUser,
    id: string,
    requestId: string,
  ): Promise<ReplayGoogleFormSubmissionResult> {
    await this.rateLimit.enforceAdmin(admin.id, true);
    try {
      const result = await this.repository.replay({
        actorAdminId: admin.id,
        inboxId: id,
        requestId,
        sourceCode: this.environment.GOOGLE_FORM_SOURCE_ID,
      });
      this.logger.info({
        actorRole: 'ADMIN',
        correlationId: requestId,
        inboxId: id,
        sourceId: this.environment.GOOGLE_FORM_SOURCE_ID,
        transition: 'ADMIN_REPLAY_REQUESTED',
      });
      return result;
    } catch (error) {
      if (!(error instanceof GoogleFormRepositoryError)) throw error;
      if (error.code === 'NOT_FOUND') throw submissionNotFound();
      throw new ApiProblemException({
        status: 409,
        code: 'INTEGRATION_REPLAY_INVALID_STATE',
        title: 'Submission cannot be replayed',
        detail: 'Only failed or rejected integration submissions can be replayed.',
      });
    }
  }

  private assertBodySize(body: unknown): string {
    let canonicalBody: string;
    try {
      canonicalBody = canonicalJson(body);
    } catch {
      throw new ApiProblemException({
        status: 400,
        code: 'GOOGLE_FORM_PAYLOAD_INVALID',
        title: 'Invalid Google Form submission',
        detail: 'The request body must be a JSON object.',
      });
    }
    if (Buffer.byteLength(canonicalBody, 'utf8') > this.environment.GOOGLE_FORM_BODY_LIMIT_BYTES) {
      throw new ApiProblemException({
        status: 413,
        code: 'INTEGRATION_BODY_TOO_LARGE',
        title: 'Integration body too large',
        detail: 'The signed integration body exceeds the configured size limit.',
      });
    }
    return canonicalBody;
  }

  private assertContentType(request: FastifyRequest): void {
    const contentType = request.headers['content-type'];
    if (typeof contentType === 'string' && /^application\/json(?:\s*;|$)/i.test(contentType))
      return;
    throw new ApiProblemException({
      status: 415,
      code: 'INTEGRATION_CONTENT_TYPE_INVALID',
      title: 'Unsupported integration content type',
      detail: 'The integration endpoint accepts application/json only.',
    });
  }
}

function safeProblemCode(error: unknown): string {
  if (!(error instanceof ApiProblemException)) return 'INTEGRATION_ADMISSION_FAILED';
  const response = error.getResponse();
  if (typeof response !== 'object' || response === null) return 'INTEGRATION_ADMISSION_FAILED';
  const code = Reflect.get(response, 'code');
  return typeof code === 'string' ? code : 'INTEGRATION_ADMISSION_FAILED';
}

function safeSourceId(value: unknown): string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{2,79}$/.test(value) ? value : 'invalid';
}

function submissionNotFound(): ApiProblemException {
  return new ApiProblemException({
    status: 404,
    code: 'GOOGLE_FORM_SUBMISSION_NOT_FOUND',
    title: 'Submission not found',
    detail: 'The Google Form submission could not be found.',
  });
}
