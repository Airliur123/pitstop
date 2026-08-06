import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { installApiShutdownHandlers, runBoundedShutdown } from './graceful-shutdown';

describe('runBoundedShutdown', () => {
  it('reports a clean close', async () => {
    const close = vi.fn(async () => undefined);

    await expect(runBoundedShutdown(close, 100)).resolves.toBe('closed');
    expect(close).toHaveBeenCalledOnce();
  });

  it('bounds a close that never settles', async () => {
    vi.useFakeTimers();
    const result = runBoundedShutdown(() => new Promise<void>(() => undefined), 250);

    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toBe('timed_out');
    vi.useRealTimers();
  });

  it('handles a normal signal once and closes the Nest/Fastify lifecycle cleanly', async () => {
    const close = vi.fn(async () => undefined);
    const terminate = vi.fn();
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
    } as unknown as Logger;
    const listenerIndex = process.listeners('SIGTERM').length;
    const previousExitCode = process.exitCode;
    const remove = installApiShutdownHandlers(
      { close } as unknown as NestFastifyApplication,
      logger,
      100,
      { terminate },
    );
    const listener = process.listeners('SIGTERM')[listenerIndex] as
      ((signal: NodeJS.Signals) => void) | undefined;

    try {
      expect(listener).toBeTypeOf('function');
      listener?.('SIGTERM');
      listener?.('SIGTERM');
      await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(logger.log).toHaveBeenCalledTimes(2));
      expect(logger.error).not.toHaveBeenCalled();
      expect(terminate).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
    } finally {
      remove();
      process.exitCode = previousExitCode;
    }
  });

  it('force-closes HTTP connections and terminates nonzero after the hard deadline', async () => {
    vi.useFakeTimers();
    const close = vi.fn(() => new Promise<void>(() => undefined));
    const closeAllConnections = vi.fn();
    const closeIdleConnections = vi.fn();
    const terminate = vi.fn();
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
    } as unknown as Logger;
    const listenerIndex = process.listeners('SIGTERM').length;
    const previousExitCode = process.exitCode;
    const remove = installApiShutdownHandlers(
      {
        close,
        getHttpServer: () => ({ closeAllConnections, closeIdleConnections }),
      } as unknown as NestFastifyApplication,
      logger,
      250,
      { terminate },
    );
    const listener = process.listeners('SIGTERM')[listenerIndex] as
      ((signal: NodeJS.Signals) => void) | undefined;

    try {
      listener?.('SIGTERM');
      await vi.advanceTimersByTimeAsync(250);
      await vi.waitFor(() => expect(terminate).toHaveBeenCalledWith(1));
      expect(close).toHaveBeenCalledOnce();
      expect(closeIdleConnections).toHaveBeenCalledOnce();
      expect(closeAllConnections).toHaveBeenCalledOnce();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'shutdown_timeout', signal: 'SIGTERM' }),
      );
      expect(process.exitCode).toBe(1);
    } finally {
      remove();
      process.exitCode = previousExitCode;
      vi.useRealTimers();
    }
  });
});
