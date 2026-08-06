import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Logger } from 'nestjs-pino';

export type ShutdownResult = 'closed' | 'timed_out';

interface ForceClosableServer {
  closeAllConnections?: () => void;
  closeIdleConnections?: () => void;
}

export interface ApiShutdownOptions {
  readonly terminate?: (exitCode: number) => void;
}

export async function runBoundedShutdown(
  close: () => Promise<void>,
  timeoutMilliseconds: number,
): Promise<ShutdownResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      close().then(() => 'closed' as const),
      new Promise<'timed_out'>((resolve) => {
        timeout = setTimeout(() => resolve('timed_out'), timeoutMilliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function installApiShutdownHandlers(
  app: NestFastifyApplication,
  logger: Logger,
  timeoutMilliseconds: number,
  options: ApiShutdownOptions = {},
): () => void {
  let stopping = false;
  const terminate = options.terminate ?? ((exitCode: number) => process.exit(exitCode));
  const handle = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    logger.log({ event: 'shutdown_started', signal });
    void runBoundedShutdown(() => app.close(), timeoutMilliseconds).then((result) => {
      if (result === 'closed') {
        logger.log({ event: 'shutdown_completed', signal });
        process.exitCode = 0;
        return;
      }
      logger.error({
        event: 'shutdown_timeout',
        signal,
        timeoutMilliseconds,
      });
      process.exitCode = 1;
      try {
        const server = app.getHttpServer() as ForceClosableServer;
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
      } finally {
        terminate(1);
      }
    });
  };
  process.once('SIGINT', handle);
  process.once('SIGTERM', handle);
  return () => {
    process.removeListener('SIGINT', handle);
    process.removeListener('SIGTERM', handle);
  };
}
