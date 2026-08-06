import { Controller, Get, Header, Inject, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { LiveHealthResponse, ReadyHealthResponse } from '@pitstop/contracts';
import type { FastifyReply } from 'fastify';

import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOkResponse({
    schema: {
      example: { status: 'ok', service: 'pitstop-api' },
    },
  })
  live(): LiveHealthResponse {
    return { status: 'ok', service: 'pitstop-api' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOkResponse({ description: 'Required dependencies are reachable.' })
  @ApiServiceUnavailableResponse({ description: 'A required dependency is unavailable.' })
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<ReadyHealthResponse> {
    const response = await this.healthService.readiness();
    if (response.status === 'not_ready') {
      reply.status(503);
    }
    return response;
  }
}
