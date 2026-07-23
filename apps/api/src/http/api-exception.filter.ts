import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ApiError, RequestId } from '@pitstop/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface ExceptionBody {
  readonly code?: unknown;
  readonly details?: unknown;
  readonly message?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception);
    }
    const rawBody = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body: ExceptionBody = typeof rawBody === 'object' && rawBody !== null ? rawBody : {};
    const message = this.resolveMessage(rawBody, body, status);
    const code = typeof body.code === 'string' ? body.code : `HTTP_${status}`;
    const details = this.resolveDetails(body.details);
    const response: ApiError = {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      requestId: request.id as RequestId,
    };

    reply.header('x-request-id', request.id).status(status).send(response);
  }

  private resolveMessage(rawBody: unknown, body: ExceptionBody, status: number): string {
    if (typeof rawBody === 'string') return rawBody;
    if (typeof body.message === 'string') return body.message;
    if (Array.isArray(body.message)) return body.message.map(String).join('; ');
    return status === HttpStatus.INTERNAL_SERVER_ERROR ? 'Internal server error' : 'Request failed';
  }

  private resolveDetails(details: unknown): Readonly<Record<string, unknown>> | undefined {
    return typeof details === 'object' && details !== null
      ? (details as Readonly<Record<string, unknown>>)
      : undefined;
  }
}
