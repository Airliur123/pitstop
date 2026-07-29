import { Body, Controller, Header, Headers, HttpCode, Inject, Post, Req } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { ApiSuccess, GoogleFormAcceptedSubmission } from '@pitstop/contracts';
import type { FastifyRequest } from 'fastify';

import { createSuccessResponse } from '../../common/http/response';
import {
  googleFormAcceptedResponseSchema,
  googleFormInboundRequestSchema,
  problemDetailsSchema,
} from '../../openapi/schemas';
import { GoogleFormService } from './google-form.service';

@ApiTags('Google Form integration')
@Controller('integrations/google-form')
export class GoogleFormController {
  constructor(@Inject(GoogleFormService) private readonly integration: GoogleFormService) {}

  @Post('submissions')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({
    operationId: 'acceptGoogleFormSubmission',
    summary: 'Durably accept a signed Google Form submission.',
  })
  @ApiHeader({ name: 'X-PitStop-Source', required: true })
  @ApiHeader({ name: 'X-PitStop-Submission-Id', required: true })
  @ApiHeader({ name: 'X-PitStop-Timestamp', required: true })
  @ApiHeader({ name: 'X-PitStop-Signature', required: true })
  @ApiHeader({ name: 'X-PitStop-Key-Id', required: false })
  @ApiBody({ schema: googleFormInboundRequestSchema })
  @ApiAcceptedResponse({
    description: 'Submission committed to the durable inbox.',
    schema: googleFormAcceptedResponseSchema,
  })
  @ApiUnauthorizedResponse({ schema: problemDetailsSchema })
  async accept(
    @Body() body: unknown,
    @Headers('x-pitstop-source') sourceId: unknown,
    @Headers('x-pitstop-submission-id') externalSubmissionId: unknown,
    @Headers('x-pitstop-timestamp') timestamp: unknown,
    @Headers('x-pitstop-signature') signature: unknown,
    @Headers('x-pitstop-key-id') keyId: unknown,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<GoogleFormAcceptedSubmission>> {
    return createSuccessResponse(
      request,
      await this.integration.accept(request, body, {
        externalSubmissionId,
        keyId,
        signature,
        sourceId,
        timestamp,
      }),
      {},
    );
  }
}
