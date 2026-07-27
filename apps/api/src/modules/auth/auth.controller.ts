import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  ApiSuccess,
  AuthSession,
  LogoutResult,
  MagicLinkRequestResult,
  MagicLinkVerificationResult,
} from '@pitstop/contracts';
import {
  type MagicLinkRequestInput,
  magicLinkRequestSchema,
  type MagicLinkVerifyInput,
  magicLinkVerifySchema,
} from '@pitstop/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { createSuccessResponse } from '../../common/http/response';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { problemDetailsSchema } from '../../openapi/schemas';
import { SessionCsrfGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { buildClearSessionCookie, buildSessionCookie } from './auth-security';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
  ) {}

  @Post('email/request')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({
    operationId: 'requestMagicLink',
    summary: 'Request a passwordless sign-in link.',
  })
  @ApiAcceptedResponse({ description: 'Generic response that does not enumerate accounts.' })
  async requestMagicLink(
    @Body(new ZodValidationPipe(magicLinkRequestSchema)) input: MagicLinkRequestInput,
    @Req() request: FastifyRequest,
  ): Promise<ApiSuccess<MagicLinkRequestResult>> {
    const result = await this.auth.requestMagicLink(input.email, input.returnTo, request.ip);
    return createSuccessResponse(request, result, {});
  }

  @Post('email/verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'verifyMagicLink', summary: 'Consume a one-time sign-in link.' })
  @ApiOkResponse({ description: 'Session created and returned as an HttpOnly cookie.' })
  @ApiUnauthorizedResponse({
    description: 'The link is invalid, expired, or already consumed.',
    schema: problemDetailsSchema,
  })
  async verifyMagicLink(
    @Body(new ZodValidationPipe(magicLinkVerifySchema)) input: MagicLinkVerifyInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccess<MagicLinkVerificationResult>> {
    const verification = await this.auth.verifyMagicLink(input.token, request.ip);
    reply.header(
      'set-cookie',
      buildSessionCookie(
        verification.rawSessionToken,
        this.environment.AUTH_SESSION_TTL_SECONDS,
        this.environment.AUTH_COOKIE_SECURE,
      ),
    );
    return createSuccessResponse(request, verification.result, {});
  }

  @Get('session')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ operationId: 'getCurrentSession', summary: 'Read the current minimal session.' })
  @ApiOkResponse({ description: 'Authenticated or unauthenticated session state.' })
  async currentSession(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccess<AuthSession>> {
    const session = await this.auth.currentSession(request);
    if (!session.authenticated && this.auth.hasSessionCookie(request)) {
      reply.header('set-cookie', buildClearSessionCookie(this.environment.AUTH_COOKIE_SECURE));
    }
    return createSuccessResponse(request, session, {});
  }

  @Post('logout')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  @UseGuards(SessionCsrfGuard)
  @ApiOperation({ operationId: 'logout', summary: 'Revoke and clear the current session.' })
  @ApiOkResponse({ description: 'Idempotent logout result.' })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ApiSuccess<LogoutResult>> {
    await this.auth.logout(request);
    reply.header('set-cookie', buildClearSessionCookie(this.environment.AUTH_COOKIE_SECURE));
    return createSuccessResponse(request, { authenticated: false }, {});
  }
}
