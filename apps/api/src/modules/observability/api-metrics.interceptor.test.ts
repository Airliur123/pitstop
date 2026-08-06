import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { ApiMetricsInterceptor } from './api-metrics.interceptor';
import { MetricsRegistry } from './metrics-registry';

function context(statusCode = 200): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        routeOptions: { url: '/api/v1/public/categories' },
      }),
      getResponse: () => ({ statusCode }),
    }),
  } as ExecutionContext;
}

describe('ApiMetricsInterceptor', () => {
  it('tracks completed and active requests using only a route template', async () => {
    const metrics = new MetricsRegistry();
    const interceptor = new ApiMetricsInterceptor(metrics);

    await firstValueFrom(interceptor.intercept(context(), { handle: () => of('ok') }));

    const rendered = metrics.render();
    expect(rendered).toContain('pitstop_api_active_requests 0');
    expect(rendered).toContain('route="/api/v1/public/categories"');
  });

  it('classifies rate-limit failures without using exception messages as labels', async () => {
    const metrics = new MetricsRegistry();
    const interceptor = new ApiMetricsInterceptor(metrics);
    const handler: CallHandler = {
      handle: () => throwError(() => new HttpException('user supplied value', 429)),
    };

    await expect(firstValueFrom(interceptor.intercept(context(), handler))).rejects.toThrow();

    const rendered = metrics.render();
    expect(rendered).toContain('error_class="rate_limit"');
    expect(rendered).toContain('pitstop_rate_limit_rejections_total{scope="public"} 1');
    expect(rendered).not.toContain('user supplied value');
  });
});
