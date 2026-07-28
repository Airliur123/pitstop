import { describe, expect, it } from 'vitest';

import { CONTRIBUTION_LOG_REDACTION_PATHS } from './contribution-security';

describe('contribution security declarations', () => {
  it('redacts contributor-authored locations, notes, and menu content from logs', () => {
    expect(CONTRIBUTION_LOG_REDACTION_PATHS).toEqual(
      expect.arrayContaining([
        'req.body.payload',
        'req.body.address',
        'req.body.landmark',
        'req.body.mapsUrl',
        'req.body.notes',
        'req.body.placeName',
        'req.body.mainMenu',
      ]),
    );
  });
});
