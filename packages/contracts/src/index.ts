export type RequestId = string & { readonly __brand: 'RequestId' };

export interface ResponseMeta {
  readonly requestId: RequestId;
  readonly generatedAt: string;
}

export interface ApiSuccess<T, TMeta extends ResponseMeta = ResponseMeta> {
  readonly success: true;
  readonly data: T;
  readonly requestId: RequestId;
  readonly meta: TMeta;
}

export interface ApiErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ApiError {
  readonly success: false;
  readonly error: ApiErrorDetail;
  readonly requestId: RequestId;
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly instance: string;
  readonly validationErrors?: readonly ValidationError[];
}

export interface ValidationError {
  readonly field: string;
  readonly message: string;
}

export interface LiveHealthResponse {
  readonly status: 'ok';
  readonly service: 'pitstop-api';
}

export interface ReadyHealthResponse {
  readonly status: 'ready' | 'not_ready';
  readonly service: 'pitstop-api';
  readonly checks: Readonly<Record<string, 'up' | 'down'>>;
}

export interface PaginationRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface PaginationMeta extends PaginationRequest {
  readonly totalItems: number;
  readonly totalPages: number;
}

export * from './public-api';
