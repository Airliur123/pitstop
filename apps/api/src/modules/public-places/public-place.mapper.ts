import type {
  PublicCategoryCode,
  PublicFacility,
  PublicPlaceCategory,
  PublicPlaceDetail,
  PublicPlaceListItem,
} from '@pitstop/contracts';
import { publicCategoryCodes } from '@pitstop/contracts';
import type {
  DatabasePublicPlace,
  DatabasePublicPlaceCategory,
  DatabasePublicPlaceDetail,
} from '@pitstop/database';

export function mapPublicPlace(
  place: DatabasePublicPlace,
  budgetApplied: boolean,
): PublicPlaceListItem {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    shortDescription: shorten(place.description),
    address: place.address,
    landmark: place.landmark,
    primaryCategory: mapCategory(place.primaryCategory),
    categories: place.categories.map(mapCategory),
    distanceMeters: Math.round(place.distanceMeters),
    latitude: place.latitude,
    longitude: place.longitude,
    placeStatus: 'ACTIVE',
    verificationStatus: 'ADMIN_VERIFIED',
    dataFreshnessAt: place.dataFreshnessAt,
    cheapestAvailableMainItem: place.cheapestAvailableMainItem,
    budgetMatch: budgetApplied ? place.cheapestQualifyingItem !== null : null,
    facilitySummary: place.facilities.map(mapFacility),
  };
}

export function mapPublicPlaceDetail(place: DatabasePublicPlaceDetail): PublicPlaceDetail {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    description: place.description,
    address: place.address,
    landmark: place.landmark,
    district: place.district,
    city: place.city,
    province: place.province,
    postalCode: place.postalCode,
    latitude: place.latitude,
    longitude: place.longitude,
    placeStatus: 'ACTIVE',
    verificationStatus: 'ADMIN_VERIFIED',
    verifiedAt: place.verifiedAt,
    dataFreshnessAt: place.dataFreshnessAt,
    categories: place.categories.map(mapCategory),
    menus: place.menus,
    facilities: place.facilities.map(mapFacility),
    operatingHours: place.operatingHours,
    operatingHourExceptions: place.operatingHourExceptions,
    photos: {
      available: place.photoCount > 0,
      count: place.photoCount,
    },
  };
}

function mapCategory(category: DatabasePublicPlaceCategory): PublicPlaceCategory {
  return { ...category, code: toCategoryCode(category.code) };
}

function mapFacility(facility: PublicFacility): PublicFacility {
  return facility;
}

function toCategoryCode(value: string): PublicCategoryCode {
  if (publicCategoryCodes.some((code) => code === value)) return value as PublicCategoryCode;
  throw new TypeError(`Unsupported public category code: ${value}`);
}

function shorten(description: string | null): string | null {
  if (description === null || description.length <= 180) return description;
  return `${description.slice(0, 177)}...`;
}
