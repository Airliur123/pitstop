import { fileURLToPath } from 'node:url';

import { parseWebEnvironment } from '@pitstop/config';
import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import type { NextConfig } from 'next';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const environment = parseWebEnvironment(loadWorkspaceEnvironment(workspaceRoot));

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  distDir: process.env.PITSTOP_E2E === 'true' ? '.next-e2e' : '.next',
  reactStrictMode: true,
  transpilePackages: [
    '@pitstop/config',
    '@pitstop/contracts',
    '@pitstop/ui',
    '@pitstop/validation',
  ],
  env: {
    NEXT_PUBLIC_API_BASE_URL: environment.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_ENABLE_UI_CATALOG: environment.NEXT_PUBLIC_ENABLE_UI_CATALOG ? 'true' : 'false',
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED:
      environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED ? 'true' : 'false',
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE:
      environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE?.toString(),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE:
      environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE?.toString(),
    NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL: environment.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL,
  },
};

export default nextConfig;
