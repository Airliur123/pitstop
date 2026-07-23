import { createHash } from 'node:crypto';

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalize(entry)]),
  );
}

export function createCacheKey(namespace: string, input: unknown): string {
  const normalized = JSON.stringify(normalize(input));
  const digest = createHash('sha256').update(normalized).digest('base64url');
  return `pitstop:public:v1:${namespace}:${digest}`;
}
