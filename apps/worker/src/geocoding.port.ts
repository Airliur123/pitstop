export const GEOCODING_PORT = Symbol('GEOCODING_PORT');

export interface GeocodingInput {
  readonly address: string;
  readonly area: string;
  readonly landmark?: string | undefined;
  readonly mapUrl?: string | undefined;
}

export type GeocodingResult =
  | {
      readonly confidence: number;
      readonly latitude: number;
      readonly longitude: number;
      readonly normalizedAddress: string;
      readonly provider: string;
      readonly rawSummary: Readonly<Record<string, unknown>>;
      readonly status: 'FOUND';
    }
  | {
      readonly provider: string;
      readonly rawSummary: Readonly<Record<string, unknown>>;
      readonly status: 'NOT_FOUND';
    };

export interface GeocodingPort {
  geocode(input: GeocodingInput): Promise<GeocodingResult>;
}
