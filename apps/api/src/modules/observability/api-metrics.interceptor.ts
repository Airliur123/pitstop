import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';
import { catchError, finalize, throwError } from 'rxjs';

import { metricRouteTemplate, MetricsRegistry } from './metrics-registry';

@Injectable()
export class ApiMetricsInterceptor implements NestInterceptor {
  constructor(@Inject(MetricsRegistry) private readonly metrics: MetricsRegistry) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const method = safeMethod(request.method);
    const route = metricRouteTemplate(request.routeOptions.url);
    const startedAt = performance.now();
    let errorStatus: number | undefined;

    this.metrics.add('pitstop_api_active_requests', {}, 1);
    return next.handle().pipe(
      catchError((error: unknown) => {
        errorStatus = error instanceof HttpException ? error.getStatus() : 500;
        return throwError(() => error);
      }),
      finalize(() => {
        const status = errorStatus ?? reply.statusCode;
        const statusClass = `${Math.floor(status / 100)}xx`;
        this.metrics.add('pitstop_api_active_requests', {}, -1);
        this.metrics.increment('pitstop_api_requests_total', {
          method,
          route,
          status_class: statusClass,
        });
        this.metrics.observe(
          'pitstop_api_request_duration_seconds',
          { method, route },
          Math.max(0, performance.now() - startedAt) / 1_000,
        );
        if (status >= 400) {
          this.metrics.increment('pitstop_api_errors_total', {
            error_class: classifyStatus(status),
            route,
            status_class: statusClass,
          });
        }
        if (status === 429) {
          this.metrics.increment('pitstop_rate_limit_rejections_total', {
            scope: route.includes('/public/') ? 'public' : 'protected',
          });
        }
      }),
    );
  }
}

function safeMethod(value: string): string {
  return ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'].includes(value)
    ? value
    : 'OTHER';
}

function classifyStatus(status: number): string {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limit';
  if (status === 503) return 'dependency_unavailable';
  return status >= 500 ? 'unexpected_internal' : 'not_found';
}
