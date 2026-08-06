import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ApiMetricsInterceptor } from './api-metrics.interceptor';
import { MetricsRegistry } from './metrics-registry';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';

@Module({
  controllers: [ObservabilityController],
  exports: [ApiMetricsInterceptor, MetricsRegistry],
  imports: [AuthModule],
  providers: [ApiMetricsInterceptor, MetricsRegistry, ObservabilityService],
})
export class ObservabilityModule {}
