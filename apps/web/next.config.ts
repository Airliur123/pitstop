import { fileURLToPath } from 'node:url';

import { parseWebEnvironment } from '@pitstop/config';
import { loadWorkspaceEnvironment } from '@pitstop/config/server';
import type { NextConfig } from 'next';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const environment = parseWebEnvironment(loadWorkspaceEnvironment(workspaceRoot));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pitstop/config', '@pitstop/contracts', '@pitstop/ui'],
  env: {
    NEXT_PUBLIC_API_BASE_URL: environment.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_ENABLE_UI_CATALOG: environment.NEXT_PUBLIC_ENABLE_UI_CATALOG ? 'true' : 'false',
  },
};

export default nextConfig;
