import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

describe('local infrastructure definition', () => {
  it('parses and declares exactly the required isolated services', () => {
    const source = readFileSync(new URL('../../../compose.yaml', import.meta.url), 'utf8');
    const document: unknown = parse(source);
    if (!isRecord(document) || !isRecord(document.services)) {
      throw new Error('compose.yaml must contain a services mapping');
    }

    expect(Object.keys(document.services).sort()).toEqual(['mailpit', 'minio', 'mysql', 'redis']);
    expect(document.networks).toMatchObject({ 'pitstop-local': { name: 'pitstop-local' } });
    expect(document.volumes).toMatchObject({
      'minio-data': null,
      'mysql-data': null,
      'redis-data': null,
    });

    for (const service of Object.values(document.services)) {
      if (!isRecord(service)) throw new Error('Every Compose service must be a mapping');
      expect(service.restart).toBe('unless-stopped');
      expect(service.networks).toContain('pitstop-local');
      expect(service.healthcheck).toBeDefined();
      if (Array.isArray(service.ports)) {
        expect(service.ports.every((port) => String(port).startsWith('127.0.0.1:'))).toBe(true);
      }
    }
  });
});
