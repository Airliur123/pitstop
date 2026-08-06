import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile('.env');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const environment = { ...process.env };

if (environment.NODE_ENV === 'development') {
  environment.NODE_ENV = 'production';
  environment.WEB_BASE_URL = 'https://web.pitstop.invalid';
  environment.ADMIN_BASE_URL = 'https://admin.pitstop.invalid';
  environment.NEXT_PUBLIC_API_BASE_URL = 'https://api.pitstop.invalid/api/v1';
  process.stdout.write(
    'Building a production-mode local validation artifact with non-deployable .invalid origins.\n',
  );
}

const turbo = spawn('turbo', ['build'], {
  env: environment,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

turbo.on('error', (error) => {
  process.stderr.write(`Unable to start the workspace build: ${error.message}\n`);
  process.exitCode = 1;
});

turbo.on('exit', (code, signal) => {
  if (signal) {
    process.stderr.write(`Workspace build terminated by ${signal}.\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
