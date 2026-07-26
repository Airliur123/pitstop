export interface VerifiedPlaceDestination {
  readonly latitude: number;
  readonly longitude: number;
  readonly verificationStatus: 'ADMIN_VERIFIED';
}

const GOOGLE_MAPS_DIRECTIONS_URL = 'https://www.google.com/maps/dir/';

function validCoordinate(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be a finite coordinate between ${minimum} and ${maximum}.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

/**
 * Google's HTTPS Maps URL is both an app-capable universal link and a browser fallback.
 * It intentionally contains only the verified public destination, never the user's origin.
 */
export function buildGoogleMapsDirectionsUrl(destination: VerifiedPlaceDestination) {
  if (destination.verificationStatus !== 'ADMIN_VERIFIED') {
    throw new TypeError('Directions require an admin-verified place.');
  }

  const latitude = validCoordinate(destination.latitude, -90, 90, 'Latitude');
  const longitude = validCoordinate(destination.longitude, -180, 180, 'Longitude');
  const url = new URL(GOOGLE_MAPS_DIRECTIONS_URL);
  url.search = new URLSearchParams({
    api: '1',
    destination: `${latitude},${longitude}`,
  }).toString();
  return url.toString();
}
