import { expect, it, vi } from 'vitest';

import { PWA_CACHE_NAMES } from './cache-policy';
import { purgePrivateBrowserCaches } from './client-cache';

it('purges legacy and runtime API caches and asks the active worker to do the same', async () => {
  const deleted: string[] = [];
  const cacheStorage = {
    delete: vi.fn(async (cacheName: string) => {
      deleted.push(cacheName);
      return true;
    }),
    keys: vi.fn(async () => [
      PWA_CACHE_NAMES.publicApi,
      PWA_CACHE_NAMES.staticAssets,
      PWA_CACHE_NAMES.precache,
      'pitstop-web-v0-pages',
      'pages',
      'unrelated-cache',
    ]),
  };
  const controller = { postMessage: vi.fn() };

  await purgePrivateBrowserCaches(cacheStorage, controller);

  expect(deleted).toEqual([PWA_CACHE_NAMES.publicApi, 'pitstop-web-v0-pages', 'pages']);
  expect(controller.postMessage).toHaveBeenCalledWith({ type: 'PURGE_PRIVATE_CACHES' });
});

it('does not turn unavailable Cache Storage into a logout failure', async () => {
  const cacheStorage = {
    delete: vi.fn(async () => true),
    keys: vi.fn(async (): Promise<string[]> => {
      throw new DOMException('blocked', 'SecurityError');
    }),
  };

  await expect(purgePrivateBrowserCaches(cacheStorage, null)).resolves.toBeUndefined();
});
