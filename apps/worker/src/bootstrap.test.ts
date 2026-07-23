import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapWorker } from './bootstrap';

describe('worker bootstrap', () => {
  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it('boots and shuts down without a queue connection in test mode', async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      REDIS_URL: 'redis://localhost:6379',
    });

    const application = await bootstrapWorker();
    expect(application).toBeDefined();
    await application.close();
  });
});
