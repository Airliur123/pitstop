import { describe, expect, it } from 'vitest';

import { createDatabaseConnectionConfig } from './index';

describe('database foundation', () => {
  it('builds typed connection settings without a domain schema', () => {
    const config = createDatabaseConnectionConfig({
      DATABASE_URL: 'mysql://pitstop:local@localhost:3306/pitstop',
    });

    expect(config).toEqual({
      uri: 'mysql://pitstop:local@localhost:3306/pitstop',
      connectionLimit: 10,
      enableKeepAlive: true,
    });
  });
});
