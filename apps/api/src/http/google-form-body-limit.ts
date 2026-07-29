import { Transform } from 'node:stream';

import type { FastifyInstance } from 'fastify';

import { ApiProblemException } from '../common/errors/api-problem.exception';

export function registerGoogleFormBodyLimit(
  fastify: FastifyInstance,
  requestPath: string,
  maximumBytes: number,
): void {
  fastify.addHook('preParsing', (request, _reply, payload, done) => {
    if ((request.url.split('?')[0] ?? request.url) !== requestPath) {
      done(null, payload);
      return;
    }
    const declaredLength = parseContentLength(request.headers['content-length']);
    if (declaredLength !== null && declaredLength > maximumBytes) {
      done(integrationBodyTooLarge());
      return;
    }

    const limited = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        limited.receivedEncodedLength += chunk.byteLength;
        if (limited.receivedEncodedLength > maximumBytes) {
          callback(integrationBodyTooLarge());
          return;
        }
        callback(null, chunk);
      },
    }) as Transform & { receivedEncodedLength: number };
    limited.receivedEncodedLength = 0;
    payload.on('error', (error) => limited.destroy(error));
    payload.pipe(limited);
    done(null, limited);
  });
}

function parseContentLength(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function integrationBodyTooLarge(): ApiProblemException {
  return new ApiProblemException({
    status: 413,
    code: 'INTEGRATION_BODY_TOO_LARGE',
    title: 'Integration body too large',
    detail: 'The signed integration body exceeds the configured size limit.',
  });
}
