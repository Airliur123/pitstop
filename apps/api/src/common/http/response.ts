import type { ApiSuccess, RequestId, ResponseMeta } from '@pitstop/contracts';
import type { FastifyRequest } from 'fastify';

export function createSuccessResponse<T, TExtra extends object>(
  request: FastifyRequest,
  data: T,
  extra: TExtra,
): ApiSuccess<T, ResponseMeta & TExtra> {
  const requestId = request.id as RequestId;
  return {
    success: true,
    data,
    requestId,
    meta: {
      requestId,
      generatedAt: new Date().toISOString(),
      ...extra,
    },
  };
}
