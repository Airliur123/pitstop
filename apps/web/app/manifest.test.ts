import { expect, it } from 'vitest';

import manifest from './manifest';

it('provides a scoped standalone manifest with install and maskable icons', () => {
  const value = manifest();

  expect(value).toMatchObject({
    display: 'standalone',
    name: expect.any(String),
    scope: '/',
    short_name: 'PitStop',
    start_url: '/',
  });
  expect(value.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sizes: '192x192',
        src: '/icons/pitstop-192.png',
        type: 'image/png',
      }),
      expect.objectContaining({
        sizes: '512x512',
        src: '/icons/pitstop-512.png',
        type: 'image/png',
      }),
      expect.objectContaining({
        purpose: 'maskable',
        sizes: '512x512',
        src: '/icons/pitstop-maskable-512.png',
        type: 'image/png',
      }),
    ]),
  );
  expect(value).not.toHaveProperty('orientation');
});
