const forbiddenAuditKeys = new Set([
  'cookie',
  'cookies',
  'evidenceReference',
  'evidenceUrl',
  'latitude',
  'longitude',
  'payload',
  'proposedChange',
  'rawGps',
  'rawPayload',
  'secret',
  'session',
  'signature',
  'token',
]);

const allowedAuditKeys = new Set([
  'changedFields',
  'confirmationCount',
  'confirmationType',
  'coordinateChanged',
  'placeId',
  'reportType',
  'reportVersion',
  'sourceReportId',
  'submittedPlaceVersion',
]);

export const REPORT_LOG_REDACTION_PATHS = [
  'req.body.explanation',
  'req.body.proposedChange',
  'req.body.approvedPatch',
  'req.body.evidenceUrl',
  'req.body.evidenceReference',
  'req.body.note',
  'req.body.resolution',
  'res.body.data.explanation',
  'res.body.data.proposal',
  'res.body.data.evidenceUrl',
  'res.body.data.evidenceReference',
] as const;

export function sanitizeAuditMetadata(
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (forbiddenAuditKeys.has(key) || !allowedAuditKeys.has(key)) continue;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      safe[key] = typeof value === 'string' ? value.slice(0, 180) : value;
      continue;
    }
    if (
      Array.isArray(value) &&
      value.length <= 30 &&
      value.every((item) => typeof item === 'string')
    ) {
      safe[key] = value.map((item) => item.slice(0, 80));
    }
  }
  return safe;
}

export interface SafePlaceSnapshotInput {
  readonly address: string;
  readonly city: string;
  readonly community_confirmation_count: number;
  readonly description: string | null;
  readonly district: string;
  readonly landmark: string | null;
  readonly name: string;
  readonly place_status: string;
  readonly postal_code: string | null;
  readonly province: string;
  readonly verification_status: string;
}

export function buildSafePlaceSnapshot(
  place: SafePlaceSnapshotInput,
): Readonly<Record<string, unknown>> {
  return {
    address: place.address,
    city: place.city,
    communityConfirmationCount: Number(place.community_confirmation_count),
    description: place.description,
    district: place.district,
    landmark: place.landmark,
    name: place.name,
    placeStatus: place.place_status,
    postalCode: place.postal_code,
    province: place.province,
    verificationStatus: place.verification_status,
  };
}
