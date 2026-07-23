import { describe, expect, it } from 'vitest';

import { createDatabaseConnectionConfig } from './index';
import { publicUserColumns } from './schema';

describe('database foundation', () => {
  it('builds typed connection settings', () => {
    const config = createDatabaseConnectionConfig({
      DATABASE_URL: 'mysql://pitstop:local@localhost:3306/pitstop',
    });

    expect(config).toEqual({
      uri: 'mysql://pitstop:local@localhost:3306/pitstop',
      connectionLimit: 10,
      enableKeepAlive: true,
    });
  });

  it('does not expose password hashes in the safe user projection', () => {
    expect(Object.hasOwn(publicUserColumns, 'passwordHash')).toBe(false);
  });
});
