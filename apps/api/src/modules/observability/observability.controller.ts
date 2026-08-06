import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { AdminSystemDiagnostics, ApiSuccess } from '@pitstop/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { createSuccessResponse } from '../../common/http/response';
import { API_ENVIRONMENT, type ApiEnvironmentProvider } from '../../configuration';
import { RequireRoles, RoleGuard, SessionAuthGuard } from '../auth/auth.guards';
import { MetricsRegistry } from './metrics-registry';
import { ObservabilityService } from './observability.service';

@RequireRoles('ADMIN')
@UseGuards(SessionAuthGuard, RoleGuard)
@Controller('admin')
export class ObservabilityController {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironmentProvider,
    @Inject(MetricsRegistry) private readonly metrics: MetricsRegistry,
    @Inject(ObservabilityService) private readonly observability: ObservabilityService,
  ) {}

  @Get('diagnostics')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  async diagnostics(@Req() request: FastifyRequest): Promise<ApiSuccess<AdminSystemDiagnostics>> {
    return createSuccessResponse(request, await this.observability.diagnostics(), {});
  }

  @Get('metrics')
  @Header('Cache-Control', 'no-store, private')
  @Header('Pragma', 'no-cache')
  async metricsEndpoint(@Res() reply: FastifyReply): Promise<void> {
    if (!this.environment.METRICS_ENABLED) {
      throw new NotFoundException();
    }
    await this.observability.refreshMetrics();
    await reply
      .header('cache-control', 'no-store, private')
      .type('text/plain; version=0.0.4; charset=utf-8')
      .send(this.metrics.render());
  }
}
