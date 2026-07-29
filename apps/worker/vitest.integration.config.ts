import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 180_000,
    include: ['test/integration/**/*.test.ts'],
    restoreMocks: true,
    testTimeout: 120_000,
  },
});
