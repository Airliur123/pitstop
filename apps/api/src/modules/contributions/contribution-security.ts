export const CONTRIBUTION_LOG_REDACTION_PATHS = [
  'req.body.payload',
  'req.body.address',
  'req.body.landmark',
  'req.body.mapsUrl',
  'req.body.notes',
  'req.body.placeName',
  'req.body.mainMenu',
  'contributionPayload',
  'contributionAddress',
  'contributionMapsUrl',
  'contributionNotes',
] as const;
