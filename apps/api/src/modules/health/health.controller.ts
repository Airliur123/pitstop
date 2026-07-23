import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { LiveHealthResponse, ReadyHealthResponse } from '@pitstop/contracts';

import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOkResponse({
    schema: {
      example: { status: 'ok', service: 'pitstop-api' },
    },
  })
  live(): LiveHealthResponse {
    return { status: 'ok', service: 'pitstop-api' };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Required dependencies are reachable.' })
  @ApiServiceUnavailableResponse({ description: 'A required dependency is unavailable.' })
  async ready(): Promise<ReadyHealthResponse> {
    const response = await this.healthService.readiness();
    if (response.status === 'not_ready') {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_NOT_READY',
        message: 'A required dependency is not ready',
        details: { checks: response.checks },
      });
    }
    return response;
  }
}
