import { shouldPurgeCacheOnLogout } from './cache-policy';

interface ServiceWorkerMessenger {
  postMessage(message: unknown): void;
}

export async function purgePrivateBrowserCaches(
  cacheStorage: Pick<CacheStorage, 'delete' | 'keys'> | undefined = globalThis.caches,
  controller: ServiceWorkerMessenger | null | undefined = globalThis.navigator?.serviceWorker
    ?.controller,
) {
  controller?.postMessage({ type: 'PURGE_PRIVATE_CACHES' });
  if (!cacheStorage) return;

  try {
    const cacheNames = await cacheStorage.keys();
    await Promise.all(
      cacheNames
        .filter(shouldPurgeCacheOnLogout)
        .map((cacheName) => cacheStorage.delete(cacheName)),
    );
  } catch {
    // Logout remains successful if browser storage is unavailable. The worker receives
    // the same purge command as a second, independent privacy defense.
  }
}
