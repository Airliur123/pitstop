export type LocationContext =
  | { readonly status: 'UNAVAILABLE' }
  | {
      readonly latitude: number;
      readonly label: string;
      readonly longitude: number;
      readonly source: 'DEVELOPMENT_PREVIEW';
      readonly status: 'READY';
    };

export function getLocationContext(): LocationContext {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_ENABLED !== 'true'
  ) {
    return { status: 'UNAVAILABLE' };
  }
  const latitude = Number(process.env.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LATITUDE);
  const longitude = Number(process.env.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LONGITUDE);
  const label = process.env.NEXT_PUBLIC_GUEST_LOCATION_PREVIEW_LABEL;
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !label
  ) {
    return { status: 'UNAVAILABLE' };
  }
  return {
    latitude,
    label,
    longitude,
    source: 'DEVELOPMENT_PREVIEW',
    status: 'READY',
  };
}
