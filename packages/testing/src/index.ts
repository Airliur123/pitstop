export const testEnvironment = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
} as const;

export function createTestRequestId(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error('Test request sequence must be a non-negative safe integer');
  }
  return `test-request-${sequence.toString().padStart(4, '0')}`;
}

export const accessibilityStandard = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] as const;

export function testcontainersRequirement(): string {
  return 'A Docker-compatible runtime is required for future integration containers.';
}
