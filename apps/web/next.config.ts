import { fileURLToPath } from 'node:url';

import { parseWebEnvironment } from '@pitstop/config';
import { buildWebSecurityHeaders } from '@pitstop/config/security';
import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const loadedEnvironment = loadWorkspaceEnvironment(workspaceRoot);
const environment = parseWebEnvironment({
  ...loadedEnvironment,
  ...(loadedEnvironment.PWA_TEST_MODE === 'true' ? { NEXT_PUBLIC_PWA_TEST_MODE: 'true' } : {}),
});
const pwaTestMode = environment.NEXT_PUBLIC_PWA_TEST_MODE;
const pwaEnabled =
  environment.NEXT_PUBLIC_PWA_ENABLED && (environment.NODE_ENV === 'production' || pwaTestMode);
const securityHeaders = buildWebSecurityHeaders({
  apiBaseUrl: environment.NEXT_PUBLIC_API_BASE_URL,
  baseUrl: environment.WEB_BASE_URL,
  clientObservabilityEndpoint: environment.NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENDPOINT,
  environment: environment.NODE_ENV,
  mapTileOrigins: environment.NEXT_PUBLIC_MAP_TILE_ORIGINS.split(',').map((origin) =>
    origin.trim(),
  ),
});
const browserSecurityHeaders = Object.entries(securityHeaders).map(([key, value]) => ({
  key,
  value,
}));
const privateResponseHeaders = [
  { key: 'Cache-Control', value: 'no-store, private' },
  { key: 'Pragma', value: 'no-cache' },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  distDir: process.env.PITSTOP_E2E === 'true' ? '.next-e2e' : '.next',
  images: { unoptimized: true },
  reactStrictMode: true,
  transpilePackages: [
    '@pitstop/config',
    '@pitstop/contracts',
    '@pitstop/ui',
    '@pitstop/validation',
  ],
  env: {
    NEXT_PUBLIC_API_BASE_URL: environment.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENABLED: environment.NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENABLED
      ? 'true'
      : 'false',
    NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENDPOINT:
      environment.NEXT_PUBLIC_CLIENT_OBSERVABILITY_ENDPOINT,
    NEXT_PUBLIC_PWA_ENABLED: pwaEnabled ? 'true' : 'false',
    NEXT_PUBLIC_ENABLE_UI_CATALOG: environment.NEXT_PUBLIC_ENABLE_UI_CATALOG ? 'true' : 'false',
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED:
      environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED ? 'true' : 'false',
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE:
      environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE?.toString(),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE:
      environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE?.toString(),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL: environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL,
  },
  async headers() {
    return [
      {
        headers: browserSecurityHeaders,
        source: '/:path*',
      },
      {
        headers: privateResponseHeaders,
        source: '/activity/:path*',
      },
      {
        headers: privateResponseHeaders,
        source: '/auth/:path*',
      },
      {
        headers: privateResponseHeaders,
        source: '/contribute/:path*',
      },
      {
        headers: privateResponseHeaders,
        source: '/reports/:path*',
      },
      {
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
        source: '/sw.js',
      },
      {
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
        source: '/manifest.webmanifest',
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  additionalPrecacheEntries: [
    { revision: 'phase-11-v1', url: '/icons/pitstop-192.png' },
    { revision: 'phase-11-v1', url: '/icons/pitstop-512.png' },
    { revision: 'phase-11-v1', url: '/icons/pitstop-maskable-512.png' },
    { revision: 'phase-11-v1', url: '/offline' },
  ],
  cacheOnNavigation: false,
  globPublicPatterns: [],
  register: false,
  reloadOnOnline: false,
  scope: '/',
  swDest: 'public/sw.js',
  swSrc: 'app/sw.ts',
  swUrl: '/sw.js',
});

export default pwaEnabled ? withSerwist(nextConfig) : nextConfig;
