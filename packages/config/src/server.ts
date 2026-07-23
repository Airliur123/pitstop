import { resolve } from 'node:path';

import { config } from 'dotenv';

export function loadWorkspaceEnvironment(workspaceRoot: string): NodeJS.ProcessEnv {
  const result = config({ path: resolve(workspaceRoot, '.env'), quiet: true });
  if (result.error) {
    throw new Error(`Unable to load workspace environment: ${result.error.message}`);
  }
  return process.env;
}
