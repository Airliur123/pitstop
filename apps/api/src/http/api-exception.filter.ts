import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ApiError, RequestId } from '@pitstop/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface ExceptionBody {
  readonly code?: unknown;
  readonly details?: unknown;
  readonly message?: unknown;
  readonly title?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const status = this.resolveStatus(exception);
    if (!(exception instanceof HttpException)) {
      this.logger.error({
        requestId: request.id,
        errorName: exception instanceof Error ? exception.name : 'UnknownError',
        errorCode: this.externalErrorCode(exception),
        diagnostic:
          exception instanceof TypeError || exception instanceof RangeError
            ? exception.message
            : undefined,
      });
    }
    const rawBody = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body: ExceptionBody = typeof rawBody === 'object' && rawBody !== null ? rawBody : {};
    const message = this.resolveMessage(rawBody, body, status);
    const code =
      typeof body.code === 'string'
        ? body.code
        : status === HttpStatus.SERVICE_UNAVAILABLE
          ? 'DATABASE_UNAVAILABLE'
          : status === HttpStatus.INTERNAL_SERVER_ERROR
            ? 'INTERNAL_ERROR'
            : `HTTP_${status}`;
    const details = this.resolveDetails(body.details);
    const validationErrors = this.resolveValidationErrors(details?.validationErrors);
    const title =
      typeof body.title === 'string'
        ? body.title
        : status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Internal server error'
          : 'Request failed';
    const response: ApiError = {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      requestId: request.id as RequestId,
      type: `https://pitstop.local/problems/${code.toLowerCase().replaceAll('_', '-')}`,
      title,
      status,
      code,
      detail: message,
      instance: request.url.split('?')[0] ?? request.url,
      ...(validationErrors ? { validationErrors } : {}),
    };

    reply
      .header('x-request-id', request.id)
      .type('application/problem+json')
      .status(status)
      .send(response);
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

  private resolveValidationErrors(
    value: unknown,
  ): readonly { readonly field: string; readonly message: string }[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const errors = value.filter(
      (entry): entry is { readonly field: string; readonly message: string } =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof Reflect.get(entry, 'field') === 'string' &&
        typeof Reflect.get(entry, 'message') === 'string',
    );
    return errors.length > 0 ? errors : undefined;
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    const code = this.externalErrorCode(exception);
    return code === 'ECONNREFUSED' || code === 'PROTOCOL_CONNECTION_LOST' || code === 'ETIMEDOUT'
      ? HttpStatus.SERVICE_UNAVAILABLE
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private externalErrorCode(exception: unknown): string | undefined {
    if (typeof exception !== 'object' || exception === null) return undefined;
    const code = Reflect.get(exception, 'code');
    return typeof code === 'string' ? code : undefined;
  }
}
